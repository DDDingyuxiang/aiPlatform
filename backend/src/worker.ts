/**
 * 知识库索引 Worker。
 *
 * 独立于 HTTP 后端进程运行，消费 Redis 队列中的索引任务。
 * 单 Worker 设计；启动时恢复 processing 列表并重置异常退出的 running 任务。
 */
import { loadAppConfig } from './config/index.js'
import { loadEnvFile } from './config/env.js'
import { createDatabasePool, pingDatabase } from './infra/db.js'
import { createKnowledgeQueue } from './infra/knowledge-queue.js'
import { createLocalFileStorage } from './infra/local-storage.js'
import { createQdrantVectorStore } from './infra/qdrant.js'
import {
  closeRedis,
  createRedisClient,
  pingRedis,
} from './infra/redis.js'
import { createEmbeddingService } from './modules/ai/index.js'
import {
  createKnowledgeIndexer,
  createMySqlKnowledgeRepository,
} from './modules/knowledge/index.js'
import { createLogger } from './shared/logger.js'

const PENDING_SCAN_INTERVAL_MS = 60_000
const PENDING_SCAN_LIMIT = 200

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  loadEnvFile()
  const config = loadAppConfig()
  const logger = createLogger(config.env === 'development' ? 'debug' : 'info')

  const pool = createDatabasePool(config.database)
  await pingDatabase(pool)
  const redis = createRedisClient(config.redis, logger)
  await pingRedis(redis)
  // BRPOPLPUSH 需要阻塞等待，不能受普通命令超时限制
  const queueRedis = createRedisClient(config.redis, logger, {
    disableCommandTimeout: true,
  })

  const repository = createMySqlKnowledgeRepository(pool)
  const queue = createKnowledgeQueue(queueRedis, logger)
  const embeddings = createEmbeddingService({
    serviceUrl: config.ai.serviceUrl,
    timeoutMs: Math.min(config.ai.timeoutMs, 30_000),
    logger,
  })
  const vectors = createQdrantVectorStore(config.qdrant, logger)
  const storage = createLocalFileStorage(config.knowledge.uploadDir)
  const indexer = createKnowledgeIndexer({
    repository,
    storage,
    embeddings,
    vectors,
    collectionName: config.qdrant.collection,
    vectorSize: config.qdrant.vectorSize,
    chunkSize: config.knowledge.chunkSize,
    chunkOverlap: config.knowledge.chunkOverlap,
    logger,
  })

  await vectors.ensureCollection().catch((error: unknown) => {
    logger.warn('knowledge.worker_qdrant_check_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  })

  // 单 Worker：启动时把上次异常退出的 running 任务重新排队
  await repository.resetRunningJobs()
  const recovered = await queue.recover()
  if (recovered.length > 0) {
    logger.info('knowledge.worker_recovered', { jobs: recovered.length })
  }

  async function enqueuePending(): Promise<void> {
    try {
      const jobs = await repository.listPendingJobs(PENDING_SCAN_LIMIT)
      for (const job of jobs) await queue.enqueue(job)
      if (jobs.length > 0) {
        logger.info('knowledge.worker_pending_enqueued', { jobs: jobs.length })
      }
    } catch (error) {
      logger.warn('knowledge.worker_pending_scan_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  await enqueuePending()
  const scanTimer = setInterval(() => {
    void enqueuePending()
  }, PENDING_SCAN_INTERVAL_MS)
  scanTimer.unref?.()

  let running = true
  const stop = (): void => {
    running = false
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  logger.info('knowledge.worker_started')

  while (running) {
    let item
    try {
      item = await queue.take(5)
    } catch (error) {
      logger.error('knowledge.worker_take_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      await sleep(5_000)
      continue
    }
    if (!item) continue

    try {
      await indexer.process(item.job)
      await queue.ack(item.raw)
    } catch (error) {
      logger.error('knowledge.worker_job_failed', {
        tenantId: item.job.tenantId,
        documentId: item.job.documentId,
        versionId: item.job.versionId,
        error: error instanceof Error ? error.message : String(error),
      })
      // 失败状态已写入数据库，ack 防止无限重试；用户可手动重试
      await queue.ack(item.raw).catch(() => undefined)
    }
  }

  clearInterval(scanTimer)
  await closeRedis(queueRedis)
  await closeRedis(redis)
  await pool.end()
  logger.info('knowledge.worker_stopped')
}

main().catch((error: unknown) => {
  console.error('knowledge worker failed', error)
  process.exit(1)
})
