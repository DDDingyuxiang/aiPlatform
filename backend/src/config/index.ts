import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { loadDatabaseConfig, type DatabaseConfig } from './database.js'
import { loadRedisConfig, type RedisConfig } from './redis.js'

/** 附件默认落在 backend/storage/uploads（部署时可用 CHAT_UPLOAD_DIR 覆盖） */
const DEFAULT_CHAT_UPLOAD_DIR = fileURLToPath(
  new URL('../../storage/uploads', import.meta.url),
)

/** 知识库原始文件默认落在 backend/storage/knowledge */
const DEFAULT_KNOWLEDGE_UPLOAD_DIR = fileURLToPath(
  new URL('../../storage/knowledge', import.meta.url),
)

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少需要 32 个字符'),
    JWT_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(7_200),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    APP_TIMEZONE: z.string().default('Asia/Shanghai'),
    /** 聊天附件本地存储目录 */
    CHAT_UPLOAD_DIR: z.string().trim().min(1).optional(),
    /** 单个聊天附件大小上限（字节），默认 20 MiB */
    CHAT_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(100 * 1024 * 1024)
      .default(20 * 1024 * 1024),
    /** 独立 AI 服务地址（Python） */
    AI_SERVICE_URL: z.url().default('http://127.0.0.1:8000'),
    /** AI 请求超时；本地小模型首次加载可能较慢 */
    AI_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(600_000)
      .default(180_000),
    /** 知识库原始文件本地存储目录 */
    KNOWLEDGE_UPLOAD_DIR: z.string().trim().min(1).optional(),
    /** 知识库单文件大小上限（字节），默认 10 MiB */
    KNOWLEDGE_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(100 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    /** Qdrant 向量库地址 */
    QDRANT_URL: z.url().default('http://127.0.0.1:6333'),
    QDRANT_API_KEY: z.string().trim().optional(),
    QDRANT_COLLECTION: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('document_chunks'),
    /** 必须与 embedding_profiles.dimension 一致 */
    QDRANT_VECTOR_SIZE: z.coerce.number().int().min(1).max(8192).default(1024),
    /** 检索默认返回条数 */
    KNOWLEDGE_SEARCH_LIMIT: z.coerce.number().int().min(1).max(50).default(6),
    /** RAG 引用的最低余弦相似度，过低的结果不进入上下文 */
    KNOWLEDGE_MIN_SCORE: z.coerce.number().min(-1).max(1).default(0.4),
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
  /** 聊天附件存储配置 */
  chat: {
    uploadDir: string
    maxUploadBytes: number
  }
  /** Redis 连接与会话/缓存配置 */
  redis: RedisConfig
  /** AI 能力服务 */
  ai: {
    serviceUrl: string
    timeoutMs: number
  }
  /** 知识库文件与检索配置 */
  knowledge: {
    uploadDir: string
    maxUploadBytes: number
    searchLimit: number
    minScore: number
    chunkSize: number
    chunkOverlap: number
  }
  /** 向量数据库 */
  qdrant: {
    url: string
    apiKey?: string
    collection: string
    vectorSize: number
  }
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
    chat: {
      uploadDir: parsed.CHAT_UPLOAD_DIR ?? DEFAULT_CHAT_UPLOAD_DIR,
      maxUploadBytes: parsed.CHAT_MAX_UPLOAD_BYTES,
    },
    redis: loadRedisConfig(env.REDIS_CONFIG_PATH, env),
    ai: {
      serviceUrl: parsed.AI_SERVICE_URL.replace(/\/+$/, ''),
      timeoutMs: parsed.AI_REQUEST_TIMEOUT_MS,
    },
    knowledge: {
      uploadDir: parsed.KNOWLEDGE_UPLOAD_DIR ?? DEFAULT_KNOWLEDGE_UPLOAD_DIR,
      maxUploadBytes: parsed.KNOWLEDGE_MAX_UPLOAD_BYTES,
      searchLimit: parsed.KNOWLEDGE_SEARCH_LIMIT,
      minScore: parsed.KNOWLEDGE_MIN_SCORE,
      chunkSize: 350,
      chunkOverlap: 60,
    },
    qdrant: {
      url: parsed.QDRANT_URL.replace(/\/+$/, ''),
      apiKey: parsed.QDRANT_API_KEY || undefined,
      collection: parsed.QDRANT_COLLECTION,
      vectorSize: parsed.QDRANT_VECTOR_SIZE,
    },
  }
}
