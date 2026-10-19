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
    /** 单次对话允许发送给模型的最大输入 token（包含系统提示、RAG、摘要与历史） */
    AI_CONTEXT_MAX_TOKENS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(32_000)
      .default(6_000),
    /** chat template、角色标记等固定开销预留 */
    AI_CONTEXT_OVERHEAD_TOKENS: z.coerce
      .number()
      .int()
      .min(0)
      .max(4_096)
      .default(256),
    /** 历史消息条数上限 */
    AI_CONTEXT_HISTORY_MESSAGES: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(32),
    /** 注入上下文的知识库资料字符上限 */
    AI_RAG_CONTEXT_CHARS: z.coerce
      .number()
      .int()
      .min(0)
      .max(20_000)
      .default(4_000),
    /** 知识库检索超时；超时后降级为普通对话 */
    AI_RAG_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(3_000),
    /** 是否启用滚动摘要 */
    AI_SUMMARY_ENABLED: z.stringbool().default(true),
    /** 未摘要历史超过该 token 数时触发摘要 */
    AI_SUMMARY_TRIGGER_TOKENS: z.coerce
      .number()
      .int()
      .min(500)
      .max(20_000)
      .default(2_500),
    /** 摘要后始终保留的最近消息条数 */
    AI_SUMMARY_KEEP_RECENT_MESSAGES: z.coerce
      .number()
      .int()
      .min(2)
      .max(50)
      .default(8),
    /** 单条摘要最大字符数 */
    AI_SUMMARY_MAX_CHARS: z.coerce
      .number()
      .int()
      .min(200)
      .max(5_000)
      .default(1_200),
    /** 摘要模型调用超时；CPU 推理长对话可能需要 1-3 分钟 */
    AI_SUMMARY_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(300_000)
      .default(180_000),
    /** 历史消息分页大小 */
    AI_CONVERSATION_PAGE_SIZE: z.coerce
      .number()
      .int()
      .min(10)
      .max(100)
      .default(50),
    /** streaming 消息超过该时长仍未完成时视为中断 */
    AI_STREAM_STALE_MS: z.coerce
      .number()
      .int()
      .min(30_000)
      .max(3_600_000)
      .default(300_000),
    /** 流式生成期间上游无数据的最长等待时间 */
    AI_STREAM_IDLE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(600_000)
      .default(180_000),
    /** 单次流式生成的总时长上限 */
    AI_STREAM_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(1_800_000)
      .default(600_000),
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
    /** 为兼容旧版本向量而扩大的召回倍数 */
    KNOWLEDGE_SEARCH_OVERFETCH: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(3),
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
    context: {
      maxTokens: number
      overheadTokens: number
      historyMessages: number
      ragContextChars: number
      ragTimeoutMs: number
    }
    summary: {
      enabled: boolean
      triggerTokens: number
      keepRecentMessages: number
      maxChars: number
      timeoutMs: number
    }
    conversationPageSize: number
    streamStaleMs: number
    stream: {
      idleTimeoutMs: number
      timeoutMs: number
    }
  }
  /** 知识库文件与检索配置 */
  knowledge: {
    uploadDir: string
    maxUploadBytes: number
    searchLimit: number
    minScore: number
    searchOverfetch: number
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
      context: {
        maxTokens: parsed.AI_CONTEXT_MAX_TOKENS,
        overheadTokens: parsed.AI_CONTEXT_OVERHEAD_TOKENS,
        historyMessages: parsed.AI_CONTEXT_HISTORY_MESSAGES,
        ragContextChars: parsed.AI_RAG_CONTEXT_CHARS,
        ragTimeoutMs: parsed.AI_RAG_TIMEOUT_MS,
      },
      summary: {
        enabled: parsed.AI_SUMMARY_ENABLED,
        triggerTokens: parsed.AI_SUMMARY_TRIGGER_TOKENS,
        keepRecentMessages: parsed.AI_SUMMARY_KEEP_RECENT_MESSAGES,
        maxChars: parsed.AI_SUMMARY_MAX_CHARS,
        timeoutMs: parsed.AI_SUMMARY_TIMEOUT_MS,
      },
      conversationPageSize: parsed.AI_CONVERSATION_PAGE_SIZE,
      streamStaleMs: parsed.AI_STREAM_STALE_MS,
      stream: {
        idleTimeoutMs: parsed.AI_STREAM_IDLE_TIMEOUT_MS,
        timeoutMs: parsed.AI_STREAM_TIMEOUT_MS,
      },
    },
    knowledge: {
      uploadDir: parsed.KNOWLEDGE_UPLOAD_DIR ?? DEFAULT_KNOWLEDGE_UPLOAD_DIR,
      maxUploadBytes: parsed.KNOWLEDGE_MAX_UPLOAD_BYTES,
      searchLimit: parsed.KNOWLEDGE_SEARCH_LIMIT,
      minScore: parsed.KNOWLEDGE_MIN_SCORE,
      searchOverfetch: parsed.KNOWLEDGE_SEARCH_OVERFETCH,
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
