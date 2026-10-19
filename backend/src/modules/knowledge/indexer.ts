/**
 * 知识库索引 Worker 的核心处理器。
 *
 * 流程：读取原始文件 → 解析 → 分块 → 写入 chunk → Embedding → Qdrant → ready。
 * 任何一步失败都会把版本/任务标记为 failed，并保留错误信息供前端重试。
 */
import type { EmbeddingService } from '../ai/index.js'
import type { LocalFileStorage } from '../../infra/local-storage.js'
import type { VectorStore } from '../../infra/qdrant.js'
import type { Logger } from '../../shared/logger.js'
import { chunkDocumentText } from './chunking.js'
import { DocumentParseError, parseDocument } from './parsers.js'
import type {
  KnowledgeJobRef,
  KnowledgeRepository,
  KnowledgeVersionRecord,
} from './types.js'

const MAX_CHUNKS_PER_DOCUMENT = 1_000

export interface KnowledgeIndexerOptions {
  repository: KnowledgeRepository
  storage: LocalFileStorage
  embeddings: EmbeddingService
  vectors: VectorStore
  collectionName: string
  vectorSize: number
  chunkSize: number
  chunkOverlap: number
  embeddingModelName?: string
  logger?: Logger
}

export interface KnowledgeIndexer {
  process(job: KnowledgeJobRef): Promise<void>
}

function errorMessage(error: unknown): string {
  if (error instanceof DocumentParseError) return error.message
  if (error instanceof Error) return error.message
  return '索引失败'
}

export function createKnowledgeIndexer(
  options: KnowledgeIndexerOptions,
): KnowledgeIndexer {
  const {
    repository,
    storage,
    embeddings,
    vectors,
    collectionName,
    vectorSize,
    chunkSize,
    chunkOverlap,
    embeddingModelName = 'BAAI/bge-m3',
    logger,
  } = options

  async function progress(
    tenantId: string,
    versionId: string,
    stage: 'parsing' | 'chunking' | 'embedding' | 'indexing',
    value: number,
  ): Promise<void> {
    await repository
      .updateEmbeddingJobProgress(tenantId, versionId, stage, value)
      .catch(() => undefined)
  }

  return {
    async process(job: KnowledgeJobRef): Promise<void> {
      const { tenantId, documentId, versionId } = job
      const target = await repository.findIndexTarget(
        tenantId,
        documentId,
        versionId,
      )
      if (!target) {
        logger?.warn('knowledge.index_target_missing', {
          tenantId,
          documentId,
          versionId,
        })
        await repository.markVersionFailed(
          tenantId,
          documentId,
          versionId,
          '文档版本不存在',
        )
        return
      }
      if (target.deleted) {
        logger?.warn('knowledge.index_target_deleted', {
          tenantId,
          documentId,
          versionId,
        })
        await repository.markVersionFailed(
          tenantId,
          documentId,
          versionId,
          '文档已删除',
        )
        return
      }
      if (target.versionStatus === 'ready') {
        // 版本已经就绪：把重复/遗留任务收敛为成功，避免反复入队
        await repository.markJobSucceeded(tenantId, versionId)
        return
      }

      const started = await repository.startEmbeddingJob(tenantId, versionId)
      if (!started) {
        logger?.info('knowledge.index_job_skipped', {
          tenantId,
          documentId,
          versionId,
        })
        return
      }

      let version: KnowledgeVersionRecord | null = null
      try {
        await progress(tenantId, versionId, 'parsing', 10)
        const buffer = await storage.read(target.storageKey)
        const parsed = await parseDocument(buffer, target.fileName)
        const chunks = chunkDocumentText(
          parsed.text,
          chunkSize,
          chunkOverlap,
        )
        if (chunks.length === 0) {
          throw new DocumentParseError('未提取到可用文本')
        }
        if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
          throw new DocumentParseError('文档分块过多，请拆分后再上传')
        }

        await progress(tenantId, versionId, 'chunking', 25)
        await repository.updateVersionParsedInfo(tenantId, versionId, {
          fileType: parsed.fileType,
          mimeType: parsed.mimeType,
        })
        const chunkIds = await repository.replaceVersionChunks(
          tenantId,
          documentId,
          versionId,
          chunks,
        )

        // 重试时清理上一次可能写入的残留向量
        await vectors.deleteVersion(tenantId, Number(versionId))

        await progress(tenantId, versionId, 'embedding', 40)
        const embeddingProfileId = await repository.ensureEmbeddingProfile({
          provider: 'local',
          modelName: embeddingModelName,
          dimension: vectorSize,
          distanceMetric: 'cosine',
          version: 'v1',
        })
        const vectorsResult = await embeddings.embed(chunks)
        if (
          vectorsResult.length !== chunks.length ||
          vectorsResult.some((vector) => vector.length !== vectorSize)
        ) {
          throw new Error('向量维度与配置不一致')
        }

        await progress(tenantId, versionId, 'indexing', 85)
        const points = chunkIds.map((chunkId, index) => ({
          id: Number(chunkId),
          vector: vectorsResult[index] ?? [],
          payload: {
            tenant_id: Number(tenantId),
            knowledge_base_id: Number(target.knowledgeBaseId),
            document_id: Number(documentId),
            document_version_id: Number(versionId),
            chunk_id: Number(chunkId),
          },
        }))
        await vectors.upsert(points)
        await repository.markVersionReady(
          tenantId,
          documentId,
          versionId,
          chunkIds.map((chunkId) => ({
            chunkId,
            collectionName,
            pointId: chunkId,
            embeddingProfileId,
          })),
        )

        version = await repository.findVersion(
          tenantId,
          target.publicId,
          target.versionNo,
        )
        logger?.info('knowledge.index_completed', {
          tenantId,
          documentId: target.publicId,
          versionNo: target.versionNo,
          chunks: chunks.length,
          isCurrent: version?.isCurrent ?? false,
        })
      } catch (error) {
        await repository
          .markVersionFailed(
            tenantId,
            documentId,
            versionId,
            errorMessage(error),
          )
          .catch((markError: unknown) => {
            logger?.error('knowledge.index_mark_failed_error', {
              tenantId,
              documentId,
              versionId,
              error:
                markError instanceof Error
                  ? markError.message
                  : String(markError),
            })
          })
        if (errorMessage(error).includes('文档不存在')) {
          await vectors
            .deleteVersion(tenantId, Number(versionId))
            .catch(() => undefined)
        }
        logger?.warn('knowledge.index_failed', {
          tenantId,
          documentId: target.publicId,
          versionNo: target.versionNo,
          error: errorMessage(error),
        })
        throw error
      }
    },
  }
}
