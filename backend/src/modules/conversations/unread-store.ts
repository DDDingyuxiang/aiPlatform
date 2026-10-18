import type { RedisClient } from '../../infra/redis.js'
import type { Logger } from '../../shared/logger.js'

/** 会话未读数存储；Redis 故障时退化为 0，不影响消息收发 */
export interface UnreadStore {
  increment(tenantId: string, employeeId: string, conversationPublicId: string): Promise<void>
  get(tenantId: string, employeeId: string, conversationPublicId: string): Promise<number>
  reset(tenantId: string, employeeId: string, conversationPublicId: string): Promise<void>
}

const UNREAD_TTL_SECONDS = 30 * 24 * 60 * 60

function unreadKey(
  tenantId: string,
  employeeId: string,
  conversationPublicId: string,
): string {
  return `chat:unread:${tenantId}:${employeeId}:${conversationPublicId}`
}

export function createRedisUnreadStore(
  redis: RedisClient,
  logger?: Logger,
): UnreadStore {
  return {
    async increment(tenantId, employeeId, conversationPublicId) {
      try {
        const key = unreadKey(tenantId, employeeId, conversationPublicId)
        await redis.multi().incr(key).expire(key, UNREAD_TTL_SECONDS).exec()
      } catch (error) {
        logger?.warn('chat.unread_increment_failed', {
          conversationId: conversationPublicId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },

    async get(tenantId, employeeId, conversationPublicId) {
      try {
        const value = await redis.get(unreadKey(tenantId, employeeId, conversationPublicId))
        return value ? Math.max(0, Number(value) || 0) : 0
      } catch (error) {
        logger?.warn('chat.unread_read_failed', {
          conversationId: conversationPublicId,
          error: error instanceof Error ? error.message : String(error),
        })
        return 0
      }
    },

    async reset(tenantId, employeeId, conversationPublicId) {
      try {
        await redis.del(unreadKey(tenantId, employeeId, conversationPublicId))
      } catch (error) {
        logger?.warn('chat.unread_reset_failed', {
          conversationId: conversationPublicId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}

/** 内存实现，仅用于测试 */
export function createMemoryUnreadStore(): UnreadStore {
  const counts = new Map<string, number>()

  return {
    async increment(tenantId, employeeId, conversationPublicId) {
      const key = unreadKey(tenantId, employeeId, conversationPublicId)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    },
    async get(tenantId, employeeId, conversationPublicId) {
      return counts.get(unreadKey(tenantId, employeeId, conversationPublicId)) ?? 0
    },
    async reset(tenantId, employeeId, conversationPublicId) {
      counts.delete(unreadKey(tenantId, employeeId, conversationPublicId))
    },
  }
}
