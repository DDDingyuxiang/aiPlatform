import { z } from 'zod'
import { loadDatabaseConfig, type DatabaseConfig } from './database.js'

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少需要 32 个字符'),
    JWT_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(7_200),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    APP_TIMEZONE: z.string().default('Asia/Shanghai'),
  })
  .superRefine((value, ctx) => {
    // 防止把 .env.example 中的示例值直接用于生产
    if (value.NODE_ENV === 'production' && value.JWT_SECRET.startsWith('replace-with-')) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: '生产环境必须配置真实的 JWT_SECRET',
      })
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value.APP_TIMEZONE })
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_TIMEZONE'],
        message: 'APP_TIMEZONE 必须是合法的 IANA 时区，例如 Asia/Shanghai',
      })
    }
  })

export interface AppConfig {
  env: 'development' | 'test' | 'production'
  port: number
  jwtSecret: string
  jwtTtlSeconds: number
  corsOrigins: string[]
  /** 业务时区：用于“本月”等按自然月统计的边界 */
  timezone: string
  database: DatabaseConfig
}

/** 加载并校验运行配置；调用前应已通过 loadEnvFile() 加载 .env */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = serverEnvSchema.parse(env)

  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    jwtSecret: parsed.JWT_SECRET,
    jwtTtlSeconds: parsed.JWT_TTL_SECONDS,
    corsOrigins: parsed.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    timezone: parsed.APP_TIMEZONE,
    database: loadDatabaseConfig(env.DB_CONFIG_PATH, env),
  }
}
