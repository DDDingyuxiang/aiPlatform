/**
 * 知识库索引任务队列（Redis List，单 Worker 部署）。
 *
 * - pending：等待处理的任务；
 * - processing：已取出、尚未 ack 的任务；
 * - Worker 启动时把 processing 中的任务放回 pending，避免进程退出丢任务。
 *
 * 当前按单 Worker 设计；如果未来横向扩容，需要改成 Redis Streams 或带 owner
 * 的租约队列，避免多个 Worker 同时恢复 processing。
 */
import type { Logger } from '../shared/logger.js'
import type { RedisClient } from './redis.js'
import type { KnowledgeJobRef } from '../modules/knowledge/types.js'

const PENDING_KEY = 'knowledge:jobs:pending'
const PROCESSING_KEY = 'knowledge:jobs:processing'

export interface KnowledgeQueue {
  enqueue(job: KnowledgeJobRef): Promise<void>
  take(timeoutSeconds: number): Promise<{ raw: string; job: KnowledgeJobRef } | null>
  ack(raw: string): Promise<void>
  requeue(raw: string): Promise<void>
  /** 把 processing 中遗留的任务放回 pending，返回可解析的任务 */
  recover(): Promise<KnowledgeJobRef[]>
}

function parseJob(raw: string): KnowledgeJobRef | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (
      typeof value.tenantId === 'string' &&
      typeof value.documentId === 'string' &&
      typeof value.versionId === 'string'
    ) {
      return {
        tenantId: value.tenantId,
        documentId: value.documentId,
        versionId: value.versionId,
      }
    }
  } catch {
    return null
  }
  return null
}

export function createKnowledgeQueue(
  redis: RedisClient,
  logger?: Logger,
): KnowledgeQueue {
  return {
    async enqueue(job) {
      await redis.lpush(PENDING_KEY, JSON.stringify(job))
    },

    async take(timeoutSeconds) {
      while (true) {
        const raw = await redis.brpoplpush(
          PENDING_KEY,
          PROCESSING_KEY,
          timeoutSeconds,
        )
        if (!raw) return null
        const job = parseJob(raw)
        if (job) return { raw, job }
        logger?.warn('knowledge.queue_invalid_job', { raw: raw.slice(0, 200) })
        await redis.lrem(PROCESSING_KEY, 1, raw)
      }
    },

    async ack(raw) {
      await redis.lrem(PROCESSING_KEY, 1, raw)
    },

    async requeue(raw) {
      const removed = await redis.lrem(PROCESSING_KEY, 1, raw)
      if (removed > 0) await redis.lpush(PENDING_KEY, raw)
    },

    async recover() {
      const items = await redis.lrange(PROCESSING_KEY, 0, -1)
      if (items.length === 0) return []
      await redis.del(PROCESSING_KEY)
      const jobs: KnowledgeJobRef[] = []
      for (const raw of items) {
        const job = parseJob(raw)
        if (job) jobs.push(job)
        else logger?.warn('knowledge.queue_invalid_job', { raw: raw.slice(0, 200) })
      }
      if (items.length > 0) {
        await redis.lpush(PENDING_KEY, ...items)
      }
      return jobs
    },
  }
}
