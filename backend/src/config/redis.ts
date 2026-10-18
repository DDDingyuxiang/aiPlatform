import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

/**
 * Redis 连接配置。
 *
 * - 连接地址等非秘密项来自 config/redis.yaml；
 * - 密码只从环境变量 REDIS_PASSWORD 读取；
 * - REDIS_* 环境变量可覆盖 YAML 中的对应字段。
 */
const redisFileSchema = z.strictObject({
  host: z.string().trim().min(1, 'Redis host 不能为空'),
  port: z.coerce.number().int().min(1).max(65535),
  db: z.coerce.number().int().min(0).max(15).default(0),
  keyPrefix: z.string().default('aiplatform:'),
  channelPrefix: z.string().default('aiplatform:rt:'),
  connectTimeoutMs: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  commandTimeoutMs: z.coerce.number().int().min(500).max(30_000).default(3_000),
})

const redisEnvSchema = z.object({
  REDIS_HOST: z.string().trim().min(1).optional(),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  REDIS_DB: z.coerce.number().int().min(0).max(15).optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().trim().min(1).optional(),
  REDIS_CHANNEL_PREFIX: z.string().trim().min(1).optional(),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).optional(),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).optional(),
  /** 身份数据缓存 TTL（秒） */
  REDIS_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(86_400).default(300),
})

const redisConfigSchema = redisFileSchema.extend({
  password: z.string(),
  cacheTtlSeconds: z.number().int().positive(),
})

export type RedisFileConfig = z.infer<typeof redisFileSchema>
export type RedisConfig = z.infer<typeof redisConfigSchema>

const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL('../../config/redis.yaml', import.meta.url),
)

/** 合并 YAML 与环境变量并校验；导出为纯函数便于测试 */
export function resolveRedisConfig(
  fileConfig: unknown,
  env: NodeJS.ProcessEnv = process.env,
): RedisConfig {
  const base = redisFileSchema.parse(fileConfig)
  const overrides = redisEnvSchema.parse(env)

  return redisConfigSchema.parse({
    host: overrides.REDIS_HOST ?? base.host,
    port: overrides.REDIS_PORT ?? base.port,
    db: overrides.REDIS_DB ?? base.db,
    password: overrides.REDIS_PASSWORD ?? '',
    keyPrefix: overrides.REDIS_KEY_PREFIX ?? base.keyPrefix,
    channelPrefix: overrides.REDIS_CHANNEL_PREFIX ?? base.channelPrefix,
    connectTimeoutMs: overrides.REDIS_CONNECT_TIMEOUT_MS ?? base.connectTimeoutMs,
    commandTimeoutMs: overrides.REDIS_COMMAND_TIMEOUT_MS ?? base.commandTimeoutMs,
    cacheTtlSeconds: overrides.REDIS_CACHE_TTL_SECONDS,
  })
}

/** 从配置文件加载 Redis 配置 */
export function loadRedisConfig(
  path = process.env.REDIS_CONFIG_PATH ?? DEFAULT_CONFIG_PATH,
  env: NodeJS.ProcessEnv = process.env,
): RedisConfig {
  const raw = parseYaml(readFileSync(path, 'utf8')) ?? {}
  return resolveRedisConfig(raw, env)
}
