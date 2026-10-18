import { createApp } from './app.js'
import { loadAppConfig } from './config/index.js'
import { loadEnvFile } from './config/env.js'
import { createDatabasePool, pingDatabase } from './infra/db.js'
import { createRedisCacheStore } from './infra/cache.js'
import { createRedisRealtimeBus } from './infra/realtime.js'
import { closeRedis, createRedisClient, pingRedis } from './infra/redis.js'
import {
  createAdminRouter,
  createAuthMiddleware,
  createAuthRouter,
  createBcryptPasswordVerifier,
  createCachedIdentityRepository,
  createIdentityRouter,
  createIdentityService,
  createMySqlIdentityRepository,
  createRedisSessionStore,
  createRequireAnyPermission,
  createTokenService,
} from './modules/identity/index.js'
import {
  createConversationsRouter,
  createConversationsService,
  createLocalAttachmentStorage,
  createMySqlConversationsRepository,
  createRedisUnreadStore,
} from './modules/conversations/index.js'
import { createAiRouter, createAiService } from './modules/ai/index.js'
import {
  createAiTaskAnalyzer,
  createMySqlTasksRepository,
  createTasksRouter,
  createTasksService,
} from './modules/tasks/index.js'
import {
  createKnowledgeRouter,
  createKnowledgeService,
  createMySqlKnowledgeRepository,
} from './modules/knowledge/index.js'
import { createEmbeddingService } from './modules/ai/index.js'
import { createLocalFileStorage } from './infra/local-storage.js'
import { createQdrantVectorStore } from './infra/qdrant.js'
import { createLogger } from './shared/logger.js'

async function main(): Promise<void> {
  loadEnvFile()
  const config = loadAppConfig()
  const logger = createLogger(config.env === 'development' ? 'debug' : 'info')

  const pool = createDatabasePool(config.database)
  await pingDatabase(pool)

  const redis = createRedisClient(config.redis, logger)
  await pingRedis(redis)

  const repository = createCachedIdentityRepository(
    createMySqlIdentityRepository(pool),
    createRedisCacheStore(redis, logger),
    { ttlSeconds: config.redis.cacheTtlSeconds },
  )
  const sessions = createRedisSessionStore(redis)
  const tokens = createTokenService({
    secret: config.jwtSecret,
    ttlSeconds: config.jwtTtlSeconds,
  })
  const identityService = createIdentityService({
    repository,
    passwords: createBcryptPasswordVerifier(),
    tokens,
    sessions,
    sessionTtlSeconds: config.jwtTtlSeconds,
    logger,
    timezone: config.timezone,
  })
  const realtime = createRedisRealtimeBus(
    redis,
    config.redis.channelPrefix,
    logger,
  )
  const tasksService = createTasksService({
    repository: createMySqlTasksRepository(pool),
    analyzer: createAiTaskAnalyzer({
      serviceUrl: config.ai.serviceUrl,
      timeoutMs: config.ai.timeoutMs,
      logger,
    }),
    timezone: config.timezone,
    logger,
  })
  const conversationsService = createConversationsService({
    repository: createMySqlConversationsRepository(pool),
    storage: createLocalAttachmentStorage(config.chat.uploadDir),
    realtime,
    unread: createRedisUnreadStore(redis, logger),
    timezone: config.timezone,
    taskExtractor: tasksService,
    maxUploadBytes: config.chat.maxUploadBytes,
    logger,
  })
  const requireAuth = createAuthMiddleware(tokens, sessions)
  const requireAnyPermission = createRequireAnyPermission(identityService)
  const authRouter = createAuthRouter({ service: identityService, requireAuth })
  const identityRouter = createIdentityRouter({ service: identityService, requireAuth })
  const adminRouter = createAdminRouter({
    service: identityService,
    requireAuth,
    requireAnyPermission,
  })
  const conversationsRouter = createConversationsRouter({
    service: conversationsService,
    requireAuth,
    realtime,
    validateSession: (sessionId) => sessions.exists(sessionId),
    maxUploadBytes: config.chat.maxUploadBytes,
  })
  const tasksRouter = createTasksRouter({ service: tasksService, requireAuth })

  const embeddings = createEmbeddingService({
    serviceUrl: config.ai.serviceUrl,
    // 向量化是 RAG 的可选前置步骤：失败时应快速降级，不能拖住整个对话
    timeoutMs: Math.min(config.ai.timeoutMs, 30_000),
    logger,
  })
  const vectorStore = createQdrantVectorStore(config.qdrant, logger)
  const knowledgeService = createKnowledgeService({
    repository: createMySqlKnowledgeRepository(pool),
    embeddings,
    vectors: vectorStore,
    storage: createLocalFileStorage(config.knowledge.uploadDir),
    collectionName: config.qdrant.collection,
    vectorSize: config.qdrant.vectorSize,
    maxUploadBytes: config.knowledge.maxUploadBytes,
    searchLimit: config.knowledge.searchLimit,
    chunkSize: config.knowledge.chunkSize,
    chunkOverlap: config.knowledge.chunkOverlap,
    logger,
  })
  const knowledgeRouter = createKnowledgeRouter({
    service: knowledgeService,
    requireAuth,
    maxUploadBytes: config.knowledge.maxUploadBytes,
  })
  const aiService = createAiService({
    serviceUrl: config.ai.serviceUrl,
    timeoutMs: config.ai.timeoutMs,
    logger,
    knowledgeMinScore: config.knowledge.minScore,
    retriever: {
      async retrieve(auth, query, limit) {
        const result = await knowledgeService.search(auth, { q: query, limit })
        return result.hits.map((hit) => ({
          documentId: hit.documentId,
          title: hit.title,
          content: hit.content,
          score: hit.score,
        }))
      },
    },
  })
  const aiRouter = createAiRouter({ service: aiService, requireAuth })

  // 向量库不可用时不影响聊天/任务；首次检索会自动重试创建
  void vectorStore.ensureCollection().catch((error: unknown) => {
    logger.warn('qdrant.startup_check_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  })

  const app = createApp({
    authRouter,
    identityRouter,
    adminRouter,
    conversationsRouter,
    aiRouter,
    tasksRouter,
    knowledgeRouter,
    healthCheck: async () => {
      await pingDatabase(pool)
      await pingRedis(redis)
    },
    corsOrigins: config.corsOrigins,
    logger,
  })

  const server = app.listen(config.port, () => {
    logger.info('server.started', {
      env: config.env,
      port: config.port,
      database: `${config.database.host}:${config.database.port}/${config.database.database}`,
    })
  })

  let shuttingDown = false
  const shutdown = (signal: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('server.shutdown', { signal })

    server.close((error) => {
      if (error) logger.error('server.close_failed', { error: error.message })
      void Promise.allSettled([
        pool.end(),
        realtime.close(),
        closeRedis(redis),
      ]).finally(() => process.exit(error ? 1 : 0))
    })

    setTimeout(() => {
      logger.error('server.shutdown_timeout')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error: unknown) => {
  // 此时配置/日志可能尚未就绪，只输出必要信息，避免泄露连接凭证
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'server.start_failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  process.exit(1)
})
