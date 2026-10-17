import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

/**
 * 数据库连接配置。
 * - 连接地址等非秘密项来自 config/database.yaml；
 * - 密码只从环境变量 DB_PASSWORD 读取；
 * - DB_* 环境变量可覆盖 YAML 中的对应字段（便于容器与多环境部署）。
 */
const databaseFileSchema = z
  .strictObject({
    host: z.string().trim().min(1, '数据库 host 不能为空'),
    port: z.coerce.number().int().min(1).max(65535),
    database: z.string().trim().min(1, '数据库名不能为空'),
    user: z.string().trim().min(1, '数据库用户不能为空'),
    connectionLimit: z.coerce.number().int().min(1).max(50).default(10),
    connectTimeoutMs: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  })

const databaseEnvSchema = z.object({
  DB_HOST: z.string().trim().min(1).optional(),
  DB_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DB_NAME: z.string().trim().min(1).optional(),
  DB_USER: z.string().trim().min(1).optional(),
  DB_PASSWORD: z.string().optional(),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(50).optional(),
})

const databaseConfigSchema = databaseFileSchema.extend({
  password: z.string(),
})

export type DatabaseFileConfig = z.infer<typeof databaseFileSchema>
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>

const DEFAULT_CONFIG_PATH = fileURLToPath(
  new URL('../../config/database.yaml', import.meta.url),
)

/**
 * 合并 YAML 与环境变量并校验。
 * 导出为纯函数，便于测试配置优先级与错误提示。
 */
export function resolveDatabaseConfig(
  fileConfig: unknown,
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const base = databaseFileSchema.parse(fileConfig)
  const overrides = databaseEnvSchema.parse(env)

  return databaseConfigSchema.parse({
    host: overrides.DB_HOST ?? base.host,
    port: overrides.DB_PORT ?? base.port,
    database: overrides.DB_NAME ?? base.database,
    user: overrides.DB_USER ?? base.user,
    connectionLimit: overrides.DB_CONNECTION_LIMIT ?? base.connectionLimit,
    connectTimeoutMs: base.connectTimeoutMs,
    password: overrides.DB_PASSWORD ?? '',
  })
}

/** 从配置文件加载数据库连接配置 */
export function loadDatabaseConfig(
  path = process.env.DB_CONFIG_PATH ?? DEFAULT_CONFIG_PATH,
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const raw = parseYaml(readFileSync(path, 'utf8')) ?? {}
  return resolveDatabaseConfig(raw, env)
}
