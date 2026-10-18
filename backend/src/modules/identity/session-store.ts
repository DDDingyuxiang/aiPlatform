import type { RedisClient } from '../../infra/redis.js'
import type { AuthContext, SessionStore } from './types.js'

const SESSION_KEY = (sessionId: string): string => `session:${sessionId}`
const USER_SESSIONS_KEY = (tenantId: string, employeeId: string): string =>
  `sessions:user:${tenantId}:${employeeId}`

interface StoredSession {
  tenantId: string
  employeeId: string
  publicId: string
}

/**
 * Redis 登录会话。
 *
 * - session:{jti} 保存登录上下文，TTL 与 JWT 有效期一致；
 * - sessions:user:{tenant}:{employee} 保存该员工全部会话 ID，用于停用/删除时批量撤销；
 * - 退出登录删除单个会话，旧 JWT 即使签名有效也会被认证中间件拒绝。
 */
export function createRedisSessionStore(redis: RedisClient): SessionStore {
  return {
    async create(sessionId, auth, ttlSeconds) {
      const session: StoredSession = {
        tenantId: auth.tenantId,
        employeeId: auth.employeeId,
        publicId: auth.publicId,
      }
      await redis
        .multi()
        .set(SESSION_KEY(sessionId), JSON.stringify(session), 'EX', ttlSeconds)
        .sadd(USER_SESSIONS_KEY(auth.tenantId, auth.employeeId), sessionId)
        .expire(USER_SESSIONS_KEY(auth.tenantId, auth.employeeId), ttlSeconds)
        .exec()
    },

    async exists(sessionId) {
      return (await redis.exists(SESSION_KEY(sessionId))) === 1
    },

    async revoke(sessionId) {
      const key = SESSION_KEY(sessionId)
      const raw = await redis.get(key)
      const pipeline = redis.multi().del(key)

      if (raw) {
        try {
          const session = JSON.parse(raw) as StoredSession
          pipeline.srem(
            USER_SESSIONS_KEY(session.tenantId, session.employeeId),
            sessionId,
          )
        } catch {
          // 会话内容损坏时只删除会话键，避免阻塞退出登录
        }
      }

      await pipeline.exec()
    },

    async revokeAllForEmployee(tenantId, employeeId) {
      const userKey = USER_SESSIONS_KEY(tenantId, employeeId)
      const sessionIds = await redis.smembers(userKey)
      const pipeline = redis.multi()

      for (const sessionId of sessionIds) {
        pipeline.del(SESSION_KEY(sessionId))
      }
      pipeline.del(userKey)
      await pipeline.exec()
    },
  }
}

/** 内存实现，仅用于测试；生产环境必须使用 Redis */
export function createMemorySessionStore(): SessionStore {
  const sessions = new Map<string, string>()
  const userSessions = new Map<string, Set<string>>()

  return {
    async create(sessionId, auth) {
      sessions.set(sessionId, JSON.stringify(auth))
      const userKey = USER_SESSIONS_KEY(auth.tenantId, auth.employeeId)
      const set = userSessions.get(userKey) ?? new Set<string>()
      set.add(sessionId)
      userSessions.set(userKey, set)
    },
    async exists(sessionId) {
      return sessions.has(sessionId)
    },
    async revoke(sessionId) {
      sessions.delete(sessionId)
      for (const set of userSessions.values()) set.delete(sessionId)
    },
    async revokeAllForEmployee(tenantId, employeeId) {
      const userKey = USER_SESSIONS_KEY(tenantId, employeeId)
      const set = userSessions.get(userKey)
      if (!set) return
      for (const sessionId of set) sessions.delete(sessionId)
      userSessions.delete(userKey)
    },
  }
}
