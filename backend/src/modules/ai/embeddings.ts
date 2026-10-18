import { AppError, ErrorCode } from '../../http/errors.js'
import type { Logger } from '../../shared/logger.js'
import type { EmbeddingService } from './types.js'

export interface EmbeddingServiceOptions {
  /** Python AI 服务地址，例如 http://127.0.0.1:8000 */
  serviceUrl: string
  timeoutMs: number
  logger?: Logger
  /** AI 服务单次请求的最大文本数 */
  batchSize?: number
}

interface EmbeddingResponse {
  model?: string
  dimension?: number
  embeddings?: unknown
}

/** 业务后端 → AI 服务 embedding 适配器。 */
export function createEmbeddingService(
  options: EmbeddingServiceOptions,
): EmbeddingService {
  const { serviceUrl, timeoutMs, logger, batchSize = 16 } = options

  async function requestBatch(texts: string[]): Promise<number[][]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const started = Date.now()

    try {
      const response = await fetch(`${serviceUrl}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: texts }),
        signal: controller.signal,
      })

      if (!response.ok) {
        logger?.warn('ai.embedding_rejected', {
          status: response.status,
          texts: texts.length,
          elapsedMs: Date.now() - started,
        })
        throw new AppError(
          ErrorCode.SERVICE_UNAVAILABLE,
          response.status === 503 ? 'Embedding 模型未就绪' : '向量化服务暂不可用',
          503,
        )
      }

      const data = (await response.json()) as EmbeddingResponse
      if (!Array.isArray(data.embeddings)) {
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '向量化服务返回格式异常', 502)
      }

      const vectors: number[][] = []
      for (const vector of data.embeddings) {
        if (
          !Array.isArray(vector) ||
          vector.length === 0 ||
          !vector.every((value) => typeof value === 'number' && Number.isFinite(value))
        ) {
          throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '向量化服务返回格式异常', 502)
        }
        vectors.push(vector)
      }
      if (vectors.length !== texts.length) {
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '向量化结果数量不一致', 502)
      }

      logger?.debug('ai.embedding_completed', {
        texts: texts.length,
        dimension: vectors[0]?.length,
        elapsedMs: Date.now() - started,
      })
      return vectors
    } catch (error) {
      if (error instanceof AppError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        logger?.warn('ai.embedding_timeout', { timeoutMs, texts: texts.length })
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '向量化服务响应超时', 504)
      }
      logger?.error('ai.embedding_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '向量化服务暂不可用', 503)
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async embed(texts) {
      const vectors: number[][] = []
      for (let start = 0; start < texts.length; start += batchSize) {
        vectors.push(...(await requestBatch(texts.slice(start, start + batchSize))))
      }
      return vectors
    },
  }
}
