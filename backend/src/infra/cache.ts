import type { RedisClient } from './redis.js'
import type { Logger } from '../shared/logger.js'

/**
 * 通用缓存接口。
 *
 * 缓存是可选的加速层：Redis 故障时自动退化为直接读数据库，
 * 不影响业务正确性；版本号用于租户级批量失效。
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>
  /** 版本号自增（用于让带版本号的旧缓存自然失效） */
  increment(key: string, ttlSeconds: number): Promise<number | null>
}

export function createRedisCacheStore(
  redis: RedisClient,
  logger?: Logger,
): CacheStore {
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = await redis.get(key)
        return raw === null ? null : (JSON.parse(raw) as T)
      } catch (error) {
        logger?.warn('cache.read_failed', {
          key,
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    },

    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      try {
        await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
      } catch (error) {
        logger?.warn('cache.write_failed', {
          key,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },

    async increment(key: string, ttlSeconds: number): Promise<number | null> {
      try {
        const value = await redis.incr(key)
        await redis.expire(key, ttlSeconds)
        return value
      } catch (error) {
        logger?.warn('cache.invalidate_failed', {
          key,
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    },
  }
}

interface MemoryEntry {
  value: string
  expiresAt: number
}

/** 内存缓存实现，仅用于测试 */
export function createMemoryCacheStore(): CacheStore & { clear(): void } {
  const entries = new Map<string, MemoryEntry>()

  function read(key: string): string | null {
    const entry = entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      entries.delete(key)
      return null
    }
    return entry.value
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = read(key)
      return raw === null ? null : (JSON.parse(raw) as T)
    },
    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      entries.set(key, {
        value: JSON.stringify(value),
        expiresAt: Date.now() + ttlSeconds * 1_000,
      })
    },
    async increment(key: string, ttlSeconds: number): Promise<number> {
      const current = Number(read(key) ?? 0)
      const next = current + 1
      entries.set(key, {
        value: JSON.stringify(next),
        expiresAt: Date.now() + ttlSeconds * 1_000,
      })
      return next
    },
    clear(): void {
      entries.clear()
    },
  }
}
