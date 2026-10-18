import { describe, expect, it } from 'vitest'
import { resolveRedisConfig } from '../redis.js'

const fileConfig = {
  host: '127.0.0.1',
  port: 6379,
  db: 0,
  keyPrefix: 'aiplatform:',
  channelPrefix: 'aiplatform:rt:',
  connectTimeoutMs: 10_000,
  commandTimeoutMs: 3_000,
}

describe('resolveRedisConfig', () => {
  it('连接地址来自配置文件，密码只从环境变量读取', () => {
    const config = resolveRedisConfig(fileConfig, { REDIS_PASSWORD: 'secret' })

    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(6379)
    expect(config.password).toBe('secret')
    expect(config.cacheTtlSeconds).toBe(300)
  })

  it('环境变量覆盖连接地址与缓存 TTL', () => {
    const config = resolveRedisConfig(fileConfig, {
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      REDIS_DB: '2',
      REDIS_PASSWORD: 'secret',
      REDIS_KEY_PREFIX: 'app:',
      REDIS_CACHE_TTL_SECONDS: '60',
    })

    expect(config).toMatchObject({
      host: 'redis.internal',
      port: 6380,
      db: 2,
      password: 'secret',
      keyPrefix: 'app:',
      cacheTtlSeconds: 60,
    })
  })

  it('拒绝把密码写进配置文件与非法端口', () => {
    expect(() =>
      resolveRedisConfig({ ...fileConfig, password: 'must-not-be-here' }, {}),
    ).toThrow()
    expect(() => resolveRedisConfig(fileConfig, { REDIS_PORT: '70000' })).toThrow()
  })
})
