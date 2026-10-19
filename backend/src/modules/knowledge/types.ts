import type { ReadStream } from 'node:fs'
import type {
  KnowledgeDoc,
  KnowledgeDocCategory,
  KnowledgeDocFileType,
  KnowledgeDocStatus,
  KnowledgeDocumentStatus,
  KnowledgeDocumentVersion,
  KnowledgeEmbeddingJobStatus,
  KnowledgeEmbeddingStage,
  KnowledgeSearchHit,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
  KnowledgeUploadQuery,
  KnowledgeVersionUploadQuery,
} from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'

export interface KnowledgeOwnerRecord {
  publicId: string
  name: string
  department: string
}

export interface KnowledgeDocumentRecord {
  documentId: string
  publicId: string
  knowledgeBaseId: string
  title: string
  category: KnowledgeDocCategory
  fileType: KnowledgeDocFileType
  status: KnowledgeDocStatus
  sizeBytes: number
  updatedAt: string
  tags: string[]
  summary: string
  fileName: string
  /** 内部上传者 ID；用于删除/回滚的创建者权限判断 */
  createdBy: string
  currentVersionId: string | null
  currentVersionNo: number | null
  versionCount: number
  owner: KnowledgeOwnerRecord
}

export interface KnowledgeBaseRef {
  id: string
  publicId: string
}

export interface KnowledgeChunkInput {
  content: string
}

/** 创建待后台索引的新文档；不包含分块，解析由 Worker 完成 */
export interface KnowledgePendingCreateRecord {
  publicId: string
  knowledgeBaseId: string
  title: string
  category: KnowledgeDocCategory
  fileType: KnowledgeDocFileType
  fileName: string
  mimeType: string
  sizeBytes: number
  storageKey: string
  checksum: string
  tags: string[]
  createdBy: string
}

export interface KnowledgePendingCreatedRecord {
  documentId: string
  versionId: string
}

/** 创建待后台索引的新版本 */
export interface KnowledgePendingVersionInput {
  storageKey: string
  checksum: string
  mimeType: string
  sizeBytes: number
  fileName: string
  fileType: KnowledgeDocFileType
}

export interface KnowledgePendingVersionRecord {
  versionId: string
  versionNo: number
}

/** Worker 处理一个版本所需的最小上下文 */
export interface KnowledgeIndexTarget {
  documentId: string
  publicId: string
  knowledgeBaseId: string
  deleted: boolean
  versionId: string
  versionNo: number
  versionStatus: KnowledgeDocStatus
  storageKey: string
  fileName: string
  fileType: KnowledgeDocFileType
  mimeType: string
}

export interface KnowledgeJobRef {
  tenantId: string
  documentId: string
  versionId: string
}

export interface KnowledgeJobRecord {
  status: KnowledgeEmbeddingJobStatus
  stage: KnowledgeEmbeddingStage | null
  progress: number
  attemptCount: number
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
}

export interface KnowledgeVersionRecord {
  versionId: string
  versionNo: number
  status: KnowledgeDocStatus
  fileName: string
  fileType: KnowledgeDocFileType
  mimeType: string
  sizeBytes: number
  checksum: string
  storageKey: string
  createdAt: string
  isCurrent: boolean
  jobStage?: KnowledgeEmbeddingStage | null
  jobProgress?: number
  errorMessage?: string | null
}

export interface KnowledgeDuplicateRecord {
  documentId: string
  publicId: string
  title: string
  versionNo: number
}

export interface KnowledgeNameCandidateRecord {
  publicId: string
  title: string
  fileName: string
  currentVersionNo: number | null
}

export interface KnowledgeDeleteRecord {
  documentId: string
  storageKeys: string[]
}

export interface EmbeddingRecordInput {
  chunkId: string
  collectionName: string
  pointId: string
  embeddingProfileId: string
}

export interface KnowledgeChunkRecord {
  chunkId: string
  chunkIndex: number
  content: string
  documentPublicId: string
  title: string
  category: KnowledgeDocCategory
  fileType: KnowledgeDocFileType
  updatedAt: string
  versionNo: number
}

export interface KnowledgeFileRecord {
  storageKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
  versionNo: number
}

export interface KnowledgeRepository {
  listDocuments(tenantId: string): Promise<KnowledgeDocumentRecord[]>
  findDocument(
    tenantId: string,
    publicId: string,
  ): Promise<KnowledgeDocumentRecord | null>
  ensureDefaultKnowledgeBase(
    tenantId: string,
    employeeId: string,
  ): Promise<KnowledgeBaseRef>
  ensureEmbeddingProfile(input: {
    provider: string
    modelName: string
    dimension: number
    distanceMetric: string
    version: string
  }): Promise<string>

  findDuplicateContent(
    tenantId: string,
    knowledgeBaseId: string,
    checksum: string,
    excludeDocumentId?: string,
  ): Promise<KnowledgeDuplicateRecord | null>

  findDocumentsByName(
    tenantId: string,
    knowledgeBaseId: string,
    fileName: string,
    excludeDocumentId?: string,
  ): Promise<KnowledgeNameCandidateRecord[]>

  /** 创建 pending 文档、v1 版本、元数据与 pending 任务（不含分块） */
  createPendingDocument(
    tenantId: string,
    record: KnowledgePendingCreateRecord,
  ): Promise<KnowledgePendingCreatedRecord>

  /** 创建 pending 新版本与 pending 任务（不含分块） */
  createPendingVersion(
    tenantId: string,
    documentId: string,
    record: KnowledgePendingVersionInput,
  ): Promise<KnowledgePendingVersionRecord>

  /** Worker：替换某版本的全部分块，返回按顺序的 chunk id */
  replaceVersionChunks(
    tenantId: string,
    documentId: string,
    versionId: string,
    chunks: string[],
  ): Promise<string[]>

  /** Worker：用解析结果修正版本的文件类型与 MIME */
  updateVersionParsedInfo(
    tenantId: string,
    versionId: string,
    input: { fileType: KnowledgeDocFileType; mimeType: string },
  ): Promise<void>

  /** Worker：把 pending 任务置为 running；返回 false 表示任务已被处理或状态不允许 */
  startEmbeddingJob(tenantId: string, versionId: string): Promise<boolean>
  updateEmbeddingJobProgress(
    tenantId: string,
    versionId: string,
    stage: KnowledgeEmbeddingStage,
    progress: number,
  ): Promise<void>
  /** 版本已就绪时把遗留任务直接标记为成功 */
  markJobSucceeded(tenantId: string, versionId: string): Promise<void>

  markVersionReady(
    tenantId: string,
    documentId: string,
    versionId: string,
    records: EmbeddingRecordInput[],
  ): Promise<void>
  markVersionFailed(
    tenantId: string,
    documentId: string,
    versionId: string,
    message: string,
  ): Promise<void>

  /** 用户重试：版本/任务回到 pending，等待 Worker 重新入队 */
  queueVersionForRetry(
    tenantId: string,
    documentId: string,
    versionId: string,
  ): Promise<void>

  /** Worker 启动时清理上次异常退出遗留的 running 任务 */
  resetRunningJobs(): Promise<void>
  /** Worker 启动/定时扫描待处理任务 */
  listPendingJobs(limit: number): Promise<KnowledgeJobRef[]>

  findIndexTarget(
    tenantId: string,
    documentId: string,
    versionId: string,
  ): Promise<KnowledgeIndexTarget | null>
  findEmbeddingJob(
    tenantId: string,
    versionId: string,
  ): Promise<KnowledgeJobRecord | null>

  listVersions(
    tenantId: string,
    publicId: string,
  ): Promise<KnowledgeVersionRecord[]>
  findVersion(
    tenantId: string,
    publicId: string,
    versionNo: number,
  ): Promise<KnowledgeVersionRecord | null>
  activateVersion(
    tenantId: string,
    publicId: string,
    versionNo: number,
  ): Promise<boolean>

  loadChunksByIds(
    tenantId: string,
    chunkIds: string[],
  ): Promise<KnowledgeChunkRecord[]>
  findDocumentFile(
    tenantId: string,
    publicId: string,
    versionNo?: number,
  ): Promise<KnowledgeFileRecord | null>

  softDeleteDocument(
    tenantId: string,
    publicId: string,
  ): Promise<KnowledgeDeleteRecord | null>
  markEmbeddingRecordsDeleted(
    tenantId: string,
    documentId: string,
  ): Promise<void>
  cancelEmbeddingJobs(tenantId: string, documentId: string): Promise<void>
}

export interface KnowledgeUploadInput extends KnowledgeUploadQuery {
  data: Buffer
}

export interface KnowledgeVersionUploadInput
  extends KnowledgeVersionUploadQuery {
  data: Buffer
}

export interface KnowledgeDownload {
  fileName: string
  mimeType: string
  sizeBytes: number
  stream: ReadStream
}

export interface KnowledgeService {
  list(auth: AuthContext): Promise<KnowledgeDoc[]>
  upload(auth: AuthContext, input: KnowledgeUploadInput): Promise<KnowledgeDoc>
  uploadVersion(
    auth: AuthContext,
    publicId: string,
    input: KnowledgeVersionUploadInput,
  ): Promise<KnowledgeDoc>
  listVersions(
    auth: AuthContext,
    publicId: string,
  ): Promise<KnowledgeDocumentVersion[]>
  status(
    auth: AuthContext,
    publicId: string,
    versionNo?: number,
  ): Promise<KnowledgeDocumentStatus>
  activateVersion(
    auth: AuthContext,
    publicId: string,
    versionNo: number,
  ): Promise<KnowledgeDoc>
  reindexVersion(
    auth: AuthContext,
    publicId: string,
    versionNo: number,
  ): Promise<KnowledgeDocumentVersion>
  deleteDocument(auth: AuthContext, publicId: string): Promise<void>
  search(
    auth: AuthContext,
    query: KnowledgeSearchQuery,
  ): Promise<KnowledgeSearchResult>
  download(
    auth: AuthContext,
    publicId: string,
    versionNo?: number,
  ): Promise<KnowledgeDownload>
}

export type { KnowledgeSearchHit }
