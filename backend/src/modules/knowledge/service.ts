import { createHash } from 'node:crypto'
import type {
  KnowledgeDoc,
  KnowledgeDocumentStatus,
  KnowledgeDocumentVersion,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
} from '@aiplatform/contracts'
import { ulid } from 'ulid'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { KnowledgeQueue } from '../../infra/knowledge-queue.js'
import type { LocalFileStorage } from '../../infra/local-storage.js'
import type { VectorStore } from '../../infra/qdrant.js'
import type { Logger } from '../../shared/logger.js'
import type { AuthContext } from '../identity/index.js'
import type { EmbeddingService } from '../ai/index.js'
import { resolveFileType } from './parsers.js'
import type {
  KnowledgeDocumentRecord,
  KnowledgeDuplicateRecord,
  KnowledgeNameCandidateRecord,
  KnowledgeRepository,
  KnowledgeService,
  KnowledgeUploadInput,
  KnowledgeVersionRecord,
  KnowledgeVersionUploadInput,
} from './types.js'

export interface KnowledgeServiceOptions {
  repository: KnowledgeRepository
  embeddings: EmbeddingService
  vectors: VectorStore
  storage: LocalFileStorage
  queue: KnowledgeQueue
  vectorSize: number
  maxUploadBytes: number
  searchLimit: number
  /** 为兼容旧版本向量而扩大的召回倍数 */
  searchOverfetch?: number
  logger?: Logger
}

const MAX_TAGS = 20
const MAX_SEARCH_OVERFETCH = 60

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
    ...(record.currentVersionNo === null
      ? {}
      : { currentVersionNo: record.currentVersionNo }),
    versionCount: record.versionCount,
  }
}

function toVersionItem(record: KnowledgeVersionRecord): KnowledgeDocumentVersion {
  return {
    versionNo: record.versionNo,
    status: record.status,
    fileName: record.fileName,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
    isCurrent: record.isCurrent,
    ...(record.jobStage === undefined || record.jobStage === null
      ? {}
      : { jobStage: record.jobStage }),
    ...(record.jobProgress === undefined
      ? {}
      : { jobProgress: record.jobProgress }),
    ...(record.errorMessage === undefined
      ? {}
      : { errorMessage: record.errorMessage }),
  }
}

function mimeTypeFromFileName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  switch (extension) {
    case 'pdf':
      return 'application/pdf'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case 'md':
    case 'markdown':
      return 'text/markdown'
    case 'txt':
      return 'text/plain'
    default:
      return 'application/octet-stream'
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
    queue,
    vectorSize,
    maxUploadBytes,
    searchLimit,
    searchOverfetch = 3,
    logger,
  } = options

  function invalid(message: string): AppError {
    return new AppError(ErrorCode.INVALID_PAYLOAD, message, 400)
  }

  function notFound(): AppError {
    return new AppError(ErrorCode.NOT_FOUND, '文档不存在', 404)
  }

  function forbidden(): AppError {
    return new AppError(ErrorCode.FORBIDDEN, '只有文档创建者可以执行该操作', 403)
  }

  function versionInvalid(message: string): AppError {
    return new AppError(ErrorCode.KNOWLEDGE_VERSION_INVALID, message, 409)
  }

  function nameConflict(candidates: KnowledgeNameCandidateRecord[]): AppError {
    return new AppError(
      ErrorCode.KNOWLEDGE_NAME_CONFLICT,
      '已存在同名文档',
      409,
      {
        details: {
          reason: 'same_name',
          candidates: candidates.map((candidate) => ({
            documentId: candidate.publicId,
            title: candidate.title,
            fileName: candidate.fileName,
            ...(candidate.currentVersionNo === null
              ? {}
              : { currentVersionNo: candidate.currentVersionNo }),
          })),
        },
      },
    )
  }

  function duplicateContent(record: KnowledgeDuplicateRecord): AppError {
    return new AppError(
      ErrorCode.KNOWLEDGE_CONTENT_DUPLICATE,
      '该文件内容已存在，无需重复上传',
      409,
      {
        details: {
          reason: 'duplicate_content',
          existing: {
            documentId: record.publicId,
            title: record.title,
            versionNo: record.versionNo,
          },
        },
      },
    )
  }

  function ensureUploadSize(data: Buffer): void {
    if (!data || data.length === 0) throw invalid('文件不能为空')
    if (data.length > maxUploadBytes) {
      throw invalid(`文件超过 ${Math.floor(maxUploadBytes / 1024 / 1024)}MB 限制`)
    }
  }

  function checksumOf(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex')
  }

  async function enqueueIndexJob(
    tenantId: string,
    documentId: string,
    versionId: string,
  ): Promise<void> {
    try {
      await queue.enqueue({ tenantId, documentId, versionId })
    } catch (error) {
      await repository
        .markVersionFailed(
          tenantId,
          documentId,
          versionId,
          '索引任务入队失败',
        )
        .catch(() => undefined)
      logger?.error('knowledge.queue_enqueue_failed', {
        tenantId,
        documentId,
        versionId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        '文件已保存，但索引任务入队失败，请稍后重试',
        503,
      )
    }
  }

  return {
    async list(auth) {
      const records = await repository.listDocuments(auth.tenantId)
      return records.map(toDocItem)
    },

    async upload(auth, input: KnowledgeUploadInput) {
      ensureUploadSize(input.data)
      const checksum = checksumOf(input.data)
      const knowledgeBase = await repository.ensureDefaultKnowledgeBase(
        auth.tenantId,
        auth.employeeId,
      )

      const duplicate = await repository.findDuplicateContent(
        auth.tenantId,
        knowledgeBase.id,
        checksum,
      )
      if (duplicate) throw duplicateContent(duplicate)

      if (!input.forceCreate) {
        const candidates = await repository.findDocumentsByName(
          auth.tenantId,
          knowledgeBase.id,
          input.fileName,
        )
        if (candidates.length > 0) throw nameConflict(candidates)
      }

      const fileType = resolveFileType(input.fileName)
      if (!fileType) throw invalid('暂不支持该文件类型')

      const tags = (input.tags ?? '')
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, MAX_TAGS)

      const publicId = ulid()
      const storageKey = `${auth.tenantId}/${publicId}/v1`
      await storage.save(storageKey, input.data)

      try {
        const created = await repository.createPendingDocument(auth.tenantId, {
          publicId,
          knowledgeBaseId: knowledgeBase.id,
          title: input.title,
          category: input.category,
          fileType,
          fileName: input.fileName,
          mimeType: mimeTypeFromFileName(input.fileName),
          sizeBytes: input.data.length,
          storageKey,
          checksum,
          tags,
          createdBy: auth.employeeId,
        })

        await enqueueIndexJob(
          auth.tenantId,
          created.documentId,
          created.versionId,
        )

        const document = await repository.findDocument(auth.tenantId, publicId)
        if (!document) {
          throw new AppError(ErrorCode.INTERNAL, '文档创建后读取失败', 500)
        }
        logger?.info('knowledge.document_queued', {
          tenantId: auth.tenantId,
          documentId: publicId,
          versionNo: 1,
        })
        return toDocItem(document)
      } catch (error) {
        // 只有元数据创建失败才清理文件；入队失败保留文件，用户可重试
        if (!(error instanceof AppError)) {
          await storage.remove(storageKey).catch(() => undefined)
        }
        throw error
      }
    },

    async uploadVersion(auth, publicId, input: KnowledgeVersionUploadInput) {
      ensureUploadSize(input.data)
      const document = await repository.findDocument(auth.tenantId, publicId)
      if (!document) throw notFound()

      const checksum = checksumOf(input.data)
      const duplicate = await repository.findDuplicateContent(
        auth.tenantId,
        document.knowledgeBaseId,
        checksum,
      )
      if (duplicate) throw duplicateContent(duplicate)

      const fileType = resolveFileType(input.fileName)
      if (!fileType) throw invalid('暂不支持该文件类型')

      const storageKey = `${auth.tenantId}/${document.publicId}/${ulid()}`
      await storage.save(storageKey, input.data)

      try {
        const created = await repository.createPendingVersion(
          auth.tenantId,
          document.documentId,
          {
            storageKey,
            checksum,
            mimeType: mimeTypeFromFileName(input.fileName),
            sizeBytes: input.data.length,
            fileName: input.fileName,
            fileType,
          },
        )
        await enqueueIndexJob(
          auth.tenantId,
          document.documentId,
          created.versionId,
        )

        const updated = await repository.findDocument(auth.tenantId, publicId)
        if (!updated) {
          await storage.remove(storageKey).catch(() => undefined)
          throw notFound()
        }
        logger?.info('knowledge.version_queued', {
          tenantId: auth.tenantId,
          documentId: publicId,
          versionNo: created.versionNo,
        })
        return toDocItem(updated)
      } catch (error) {
        if (!(error instanceof AppError)) {
          await storage.remove(storageKey).catch(() => undefined)
        }
        throw error
      }
    },

    async listVersions(auth, publicId) {
      const document = await repository.findDocument(auth.tenantId, publicId)
      if (!document) throw notFound()
      const versions = await repository.listVersions(auth.tenantId, publicId)
      return versions.map(toVersionItem)
    },

    async status(auth, publicId, versionNo): Promise<KnowledgeDocumentStatus> {
      const document = await repository.findDocument(auth.tenantId, publicId)
      if (!document) throw notFound()
      const versions = await repository.listVersions(auth.tenantId, publicId)
      const version = versionNo
        ? versions.find((item) => item.versionNo === versionNo) ?? null
        : (versions[0] ?? null)
      if (versionNo && !version) throw versionInvalid('版本不存在')
      const job = version
        ? await repository.findEmbeddingJob(auth.tenantId, version.versionId)
        : null
      return {
        document: toDocItem(document),
        version: version ? toVersionItem(version) : null,
        job,
      }
    },

    async activateVersion(auth, publicId, versionNo) {
      const document = await repository.findDocument(auth.tenantId, publicId)
      if (!document) throw notFound()
      if (document.createdBy !== auth.employeeId) throw forbidden()
      const activated = await repository.activateVersion(
        auth.tenantId,
        publicId,
        versionNo,
      )
      if (!activated) throw versionInvalid('版本不存在或尚未就绪')
      const updated = await repository.findDocument(auth.tenantId, publicId)
      if (!updated) throw notFound()
      logger?.info('knowledge.version_activated', {
        tenantId: auth.tenantId,
        documentId: publicId,
        versionNo,
      })
      return toDocItem(updated)
    },

    async reindexVersion(auth, publicId, versionNo) {
      const document = await repository.findDocument(auth.tenantId, publicId)
      if (!document) throw notFound()
      const version = await repository.findVersion(
        auth.tenantId,
        publicId,
        versionNo,
      )
      if (!version) throw versionInvalid('版本不存在')
      if (version.status !== 'failed') {
        throw versionInvalid('只有索引失败的版本可以重试')
      }

      await repository.queueVersionForRetry(
        auth.tenantId,
        document.documentId,
        version.versionId,
      )
      await enqueueIndexJob(
        auth.tenantId,
        document.documentId,
        version.versionId,
      )
      const refreshed = await repository.findVersion(
        auth.tenantId,
        publicId,
        versionNo,
      )
      if (!refreshed) throw notFound()
      logger?.info('knowledge.version_retry_queued', {
        tenantId: auth.tenantId,
        documentId: publicId,
        versionNo,
      })
      return toVersionItem(refreshed)
    },

    async deleteDocument(auth, publicId) {
      const document = await repository.findDocument(auth.tenantId, publicId)
      if (!document) throw notFound()
      if (document.createdBy !== auth.employeeId) throw forbidden()

      const deleted = await repository.softDeleteDocument(
        auth.tenantId,
        publicId,
      )
      if (!deleted) throw notFound()

      await vectors
        .deleteDocument(auth.tenantId, Number(deleted.documentId))
        .catch((error: unknown) => {
          logger?.warn('knowledge.vector_cleanup_failed', {
            tenantId: auth.tenantId,
            documentId: publicId,
            error: error instanceof Error ? error.message : String(error),
          })
        })
      await repository
        .markEmbeddingRecordsDeleted(auth.tenantId, deleted.documentId)
        .catch((error: unknown) => {
          logger?.warn('knowledge.embedding_records_cleanup_failed', {
            tenantId: auth.tenantId,
            documentId: publicId,
            error: error instanceof Error ? error.message : String(error),
          })
        })
      await repository
        .cancelEmbeddingJobs(auth.tenantId, deleted.documentId)
        .catch(() => undefined)

      const results = await Promise.allSettled(
        deleted.storageKeys.map((key) => storage.remove(key)),
      )
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger?.warn('knowledge.file_cleanup_failed', {
            tenantId: auth.tenantId,
            documentId: publicId,
            storageKey: deleted.storageKeys[index],
          })
        }
      })
      logger?.info('knowledge.document_deleted', {
        tenantId: auth.tenantId,
        documentId: publicId,
        versions: deleted.storageKeys.length,
      })
    },

    async search(auth, query: KnowledgeSearchQuery): Promise<KnowledgeSearchResult> {
      const limit = Math.min(query.limit ?? searchLimit, 20)
      const overfetch = Math.min(limit * searchOverfetch, MAX_SEARCH_OVERFETCH)
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
        vectorHits = await vectors.search(vector, auth.tenantId, overfetch)
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

      const hits = vectorHits
        .flatMap((hit) => {
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
              versionNo: chunk.versionNo,
            },
          ]
        })
        .slice(0, limit)

      return { query: query.q, hits }
    },

    async download(auth, publicId, versionNo) {
      const file = await repository.findDocumentFile(
        auth.tenantId,
        publicId,
        versionNo,
      )
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
