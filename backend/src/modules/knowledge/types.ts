import type { ReadStream } from 'node:fs'
import type {
  KnowledgeDoc,
  KnowledgeDocCategory,
  KnowledgeDocFileType,
  KnowledgeDocStatus,
  KnowledgeSearchHit,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
  KnowledgeUploadQuery,
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
  owner: KnowledgeOwnerRecord
}

export interface KnowledgeBaseRef {
  id: string
  publicId: string
}

export interface KnowledgeChunkInput {
  content: string
}

export interface KnowledgeCreateRecord {
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
  summary: string
  createdBy: string
  chunks: KnowledgeChunkInput[]
}

export interface KnowledgeCreatedRecord {
  documentId: string
  versionId: string
  chunkIds: string[]
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
}

export interface KnowledgeFileRecord {
  storageKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
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
  createDocument(
    tenantId: string,
    record: KnowledgeCreateRecord,
  ): Promise<KnowledgeCreatedRecord>
  markDocumentReady(
    tenantId: string,
    documentId: string,
    versionId: string,
    records: EmbeddingRecordInput[],
  ): Promise<void>
  markDocumentFailed(
    tenantId: string,
    documentId: string,
    versionId: string,
    message: string,
  ): Promise<void>
  loadChunksByIds(
    tenantId: string,
    chunkIds: string[],
  ): Promise<KnowledgeChunkRecord[]>
  findDocumentFile(
    tenantId: string,
    publicId: string,
  ): Promise<KnowledgeFileRecord | null>
}

export interface KnowledgeUploadInput extends KnowledgeUploadQuery {
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
  search(
    auth: AuthContext,
    query: KnowledgeSearchQuery,
  ): Promise<KnowledgeSearchResult>
  download(auth: AuthContext, publicId: string): Promise<KnowledgeDownload>
}

export type { KnowledgeSearchHit }
