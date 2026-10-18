import { createHash } from 'node:crypto'
import type {
  KnowledgeDoc,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
} from '@aiplatform/contracts'
import { ulid } from 'ulid'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { LocalFileStorage } from '../../infra/local-storage.js'
import type { VectorStore } from '../../infra/qdrant.js'
import type { Logger } from '../../shared/logger.js'
import type { AuthContext } from '../identity/index.js'
import type { EmbeddingService } from '../ai/index.js'
import { chunkDocumentText } from './chunking.js'
import { DocumentParseError, parseDocument } from './parsers.js'
import type {
  KnowledgeDocumentRecord,
  KnowledgeRepository,
  KnowledgeService,
  KnowledgeUploadInput,
} from './types.js'

export interface KnowledgeServiceOptions {
  repository: KnowledgeRepository
  embeddings: EmbeddingService
  vectors: VectorStore
  storage: LocalFileStorage
  collectionName: string
  vectorSize: number
  maxUploadBytes: number
  searchLimit: number
  chunkSize: number
  chunkOverlap: number
  embeddingModelName?: string
  logger?: Logger
}

const MAX_CHUNKS_PER_DOCUMENT = 1_000
const MAX_TAGS = 20

function toDocItem(record: KnowledgeDocumentRecord): KnowledgeDoc {
  return {
    id: record.publicId,
    title: record.title,
    category: record.category,
    fileType: record.fileType,
    sizeBytes: record.sizeBytes,
    owner: { id: record.owner.publicId, name: record.owner.name },
    department: record.owner.department,
    updatedAt: record.updatedAt,
    tags: record.tags,
    summary: record.summary,
    status: record.status,
    fileName: record.fileName,
  }
}

export function createKnowledgeService(
  options: KnowledgeServiceOptions,
): KnowledgeService {
  const {
    repository,
    embeddings,
    vectors,
    storage,
    collectionName,
    vectorSize,
    maxUploadBytes,
    searchLimit,
    chunkSize,
    chunkOverlap,
    embeddingModelName = 'BAAI/bge-m3',
    logger,
  } = options

  function invalid(message: string): AppError {
    return new AppError(ErrorCode.INVALID_PAYLOAD, message, 400)
  }

  function notFound(): AppError {
    return new AppError(ErrorCode.NOT_FOUND, '文档不存在', 404)
  }

  return {
    async list(auth) {
      const records = await repository.listDocuments(auth.tenantId)
      return records.map(toDocItem)
    },

    async upload(auth, input: KnowledgeUploadInput) {
      if (!input.data || input.data.length === 0) {
        throw invalid('文件不能为空')
      }
      if (input.data.length > maxUploadBytes) {
        throw invalid(`文件超过 ${Math.floor(maxUploadBytes / 1024 / 1024)}MB 限制`)
      }

      let parsed
      try {
        parsed = await parseDocument(input.data, input.fileName)
      } catch (error) {
        if (error instanceof DocumentParseError) throw invalid(error.message)
        throw error
      }

      const chunks = chunkDocumentText(parsed.text, chunkSize, chunkOverlap)
      if (chunks.length === 0) {
        throw invalid('未提取到可用文本')
      }
      if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
        throw invalid('文档分块过多，请拆分后再上传')
      }

      const tags = (input.tags ?? '')
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, MAX_TAGS)

      const publicId = ulid()
      const storageKey = `${auth.tenantId}/${publicId}/v1`
      await storage.save(storageKey, input.data)

      try {
        const knowledgeBase = await repository.ensureDefaultKnowledgeBase(
          auth.tenantId,
          auth.employeeId,
        )
        const embeddingProfileId = await repository.ensureEmbeddingProfile({
          provider: 'local',
          modelName: embeddingModelName,
          dimension: vectorSize,
          distanceMetric: 'cosine',
          version: 'v1',
        })

        const created = await repository.createDocument(auth.tenantId, {
          publicId,
          knowledgeBaseId: knowledgeBase.id,
          title: input.title,
          category: input.category,
          fileType: parsed.fileType,
          fileName: input.fileName,
          mimeType: parsed.mimeType,
          sizeBytes: input.data.length,
          storageKey,
          checksum: createHash('sha256').update(input.data).digest('hex'),
          tags,
          // 摘要由后续 AI 能力补充；先保留空值，避免把截断文本伪装成 AI 摘要
          summary: '',
          createdBy: auth.employeeId,
          chunks: chunks.map((content) => ({ content })),
        })

        try {
          const vectorsResult = await embeddings.embed(chunks)
          if (
            vectorsResult.length !== chunks.length ||
            vectorsResult.some((vector) => vector.length !== vectorSize)
          ) {
            throw new AppError(
              ErrorCode.SERVICE_UNAVAILABLE,
              '向量维度与配置不一致',
              503,
            )
          }

          const points = created.chunkIds.map((chunkId, index) => ({
            id: Number(chunkId),
            vector: vectorsResult[index] ?? [],
            payload: {
              tenant_id: Number(auth.tenantId),
              knowledge_base_id: Number(knowledgeBase.id),
              document_id: Number(created.documentId),
              document_version_id: Number(created.versionId),
              chunk_id: Number(chunkId),
            },
          }))

          await vectors.upsert(points)
          await repository.markDocumentReady(
            auth.tenantId,
            created.documentId,
            created.versionId,
            created.chunkIds.map((chunkId) => ({
              chunkId,
              collectionName,
              pointId: chunkId,
              embeddingProfileId,
            })),
          )
        } catch (error) {
          logger?.error('knowledge.index_failed', {
            tenantId: auth.tenantId,
            documentId: created.documentId,
            error: error instanceof Error ? error.message : String(error),
          })
          await repository
            .markDocumentFailed(
              auth.tenantId,
              created.documentId,
              created.versionId,
              error instanceof Error ? error.message : '索引失败',
            )
            .catch((markError: unknown) => {
              logger?.error('knowledge.mark_failed_error', {
                error: markError instanceof Error ? markError.message : String(markError),
              })
            })
          if (error instanceof AppError) throw error
          throw new AppError(
            ErrorCode.SERVICE_UNAVAILABLE,
            '文档已保存，但向量索引失败，请稍后重试',
            503,
          )
        }

        const document = await repository.findDocument(auth.tenantId, publicId)
        if (!document) {
          throw new AppError(ErrorCode.INTERNAL, '文档创建后读取失败', 500)
        }
        logger?.info('knowledge.document_indexed', {
          tenantId: auth.tenantId,
          documentId: publicId,
          chunks: chunks.length,
        })
        return toDocItem(document)
      } catch (error) {
        // 元数据创建失败时清理已落盘文件，避免孤儿文件
        if (!(error instanceof AppError)) {
          await storage.remove(storageKey).catch(() => undefined)
        }
        throw error
      }
    },

    async search(auth, query: KnowledgeSearchQuery): Promise<KnowledgeSearchResult> {
      const limit = Math.min(query.limit ?? searchLimit, 20)
      let vector: number[]
      try {
        const result = await embeddings.embed([query.q])
        vector = result[0] ?? []
      } catch (error) {
        logger?.warn('knowledge.search_embedding_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
      if (vector.length !== vectorSize) {
        throw new AppError(
          ErrorCode.SERVICE_UNAVAILABLE,
          '向量维度与配置不一致',
          503,
        )
      }

      let vectorHits
      try {
        vectorHits = await vectors.search(vector, auth.tenantId, limit)
      } catch (error) {
        logger?.warn('knowledge.vector_search_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw new AppError(
          ErrorCode.SERVICE_UNAVAILABLE,
          '知识检索暂不可用，请稍后重试',
          503,
        )
      }

      const chunkIds = vectorHits.map((hit) => String(hit.id))
      const chunks = await repository.loadChunksByIds(auth.tenantId, chunkIds)
      const chunkMap = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]))

      const hits = vectorHits.flatMap((hit) => {
        const chunk = chunkMap.get(String(hit.id))
        if (!chunk) return []
        return [
          {
            documentId: chunk.documentPublicId,
            title: chunk.title,
            category: chunk.category,
            fileType: chunk.fileType,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            score: Math.max(-1, Math.min(1, hit.score)),
            updatedAt: chunk.updatedAt,
          },
        ]
      })

      return { query: query.q, hits }
    },

    async download(auth, publicId) {
      const file = await repository.findDocumentFile(auth.tenantId, publicId)
      if (!file) throw notFound()
      return {
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        stream: await storage.open(file.storageKey),
      }
    },
  }
}
