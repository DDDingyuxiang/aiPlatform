import { Redis } from 'ioredis'
import type { RedisConfig } from '../config/redis.js'
import type { Logger } from '../shared/logger.js'

/** ioredis 客户端（键前缀由配置注入，业务代码使用不带前缀的键名） */
export type RedisClient = Redis

export function createRedisClient(config: RedisConfig, logger?: Logger): RedisClient {
  const client = new Redis({
    host: config.host,
    port: config.port,
    db: config.db,
    ...(config.password ? { password: config.password } : {}),
    keyPrefix: config.keyPrefix,
    connectTimeout: config.connectTimeoutMs,
    commandTimeout: config.commandTimeoutMs,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  })

  // EventEmitter 的 error 事件必须有监听者，否则会抛出导致进程退出
  client.on('error', (error: Error) => {
    logger?.warn('redis.error', { error: error.message })
  })

  return client
}

export async function pingRedis(client: RedisClient): Promise<void> {
  await client.ping()
}

export async function closeRedis(client: RedisClient): Promise<void> {
  try {
    await client.quit()
  } catch {
    client.disconnect()
  }
}
