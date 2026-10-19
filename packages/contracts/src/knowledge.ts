/**
 * 企业知识库契约。
 *
 * - 文档元数据与分块原文保存在 MySQL；Qdrant 只保存可重建的向量索引；
 * - 检索结果返回文档公开 ID 与分块原文，前端用于展示引用来源；
 * - 上传接口使用二进制请求体，元数据通过查询参数传递。
 */
import { z } from 'zod'
import { apiIdSchema, isoDateTimeSchema } from './common.js'

export const knowledgeDocCategorySchema = z.enum([
  'policy',
  'product',
  'tech',
  'market',
  'training',
])
export type KnowledgeDocCategory = z.infer<typeof knowledgeDocCategorySchema>

export const knowledgeDocFileTypeSchema = z.enum(['pdf', 'doc', 'xls', 'ppt', 'img', 'txt'])
export type KnowledgeDocFileType = z.infer<typeof knowledgeDocFileTypeSchema>

export const knowledgeDocStatusSchema = z.enum([
  'pending',
  'processing',
  'ready',
  'failed',
])
export type KnowledgeDocStatus = z.infer<typeof knowledgeDocStatusSchema>

export const knowledgePersonSchema = z.object({
  id: apiIdSchema,
  name: z.string().min(1).max(128),
})
export type KnowledgePerson = z.infer<typeof knowledgePersonSchema>

export const knowledgeDocSchema = z.object({
  id: apiIdSchema,
  title: z.string().min(1).max(512),
  category: knowledgeDocCategorySchema,
  fileType: knowledgeDocFileTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
  owner: knowledgePersonSchema,
  department: z.string().max(255),
  updatedAt: isoDateTimeSchema,
  tags: z.array(z.string().max(64)).max(20),
  summary: z.string().max(5_000),
  status: knowledgeDocStatusSchema.optional(),
  /** 原始文件名；仅用于下载与展示，服务端不使用其作为存储路径 */
  fileName: z.string().max(512).optional(),
  /** 当前生效版本号；历史数据或未就绪文档可能为空 */
  currentVersionNo: z.number().int().positive().optional(),
  /** 版本总数 */
  versionCount: z.number().int().nonnegative().optional(),
})
export type KnowledgeDoc = z.infer<typeof knowledgeDocSchema>

/** 上传元数据（查询参数；文件本体放在请求体中） */
export const knowledgeUploadQuerySchema = z.strictObject({
  title: z.string().trim().min(1).max(255),
  category: knowledgeDocCategorySchema.default('policy'),
  /** 多个标签用英文或中文逗号分隔 */
  tags: z.string().trim().max(512).optional(),
  fileName: z.string().trim().min(1).max(512),
  /** 同名文件仍作为新文档上传（前端冲突弹窗选择“仍作为新文档”时传 true） */
  forceCreate: z.stringbool().optional(),
})
export type KnowledgeUploadQuery = z.infer<typeof knowledgeUploadQuerySchema>

/** 上传新版本的查询参数 */
export const knowledgeVersionUploadQuerySchema = z.strictObject({
  fileName: z.string().trim().min(1).max(512),
})
export type KnowledgeVersionUploadQuery = z.infer<
  typeof knowledgeVersionUploadQuerySchema
>

/** 下载指定版本；缺省为当前版本 */
export const knowledgeDownloadQuerySchema = z.strictObject({
  versionNo: z.coerce.number().int().min(1).optional(),
})
export type KnowledgeDownloadQuery = z.infer<
  typeof knowledgeDownloadQuerySchema
>

/** 文档版本历史项 */
export const knowledgeEmbeddingStageSchema = z.enum([
  'queued',
  'parsing',
  'chunking',
  'embedding',
  'indexing',
  'completed',
  'failed',
])
export type KnowledgeEmbeddingStage = z.infer<
  typeof knowledgeEmbeddingStageSchema
>

export const knowledgeEmbeddingJobStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'canceled',
])
export type KnowledgeEmbeddingJobStatus = z.infer<
  typeof knowledgeEmbeddingJobStatusSchema
>

export const knowledgeDocumentVersionSchema = z.object({
  versionNo: z.number().int().positive(),
  status: knowledgeDocStatusSchema,
  fileName: z.string().max(512),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  isCurrent: z.boolean(),
  /** 该版本最新索引任务的阶段/进度；无任务时为空 */
  jobStage: knowledgeEmbeddingStageSchema.optional(),
  jobProgress: z.number().int().min(0).max(100).optional(),
  errorMessage: z.string().max(2_000).nullable().optional(),
})
export type KnowledgeDocumentVersion = z.infer<
  typeof knowledgeDocumentVersionSchema
>

export const knowledgeDocumentVersionListSchema = z.array(
  knowledgeDocumentVersionSchema,
)
export type KnowledgeDocumentVersionList = z.infer<
  typeof knowledgeDocumentVersionListSchema
>

export const knowledgeEmbeddingJobSchema = z.object({
  status: knowledgeEmbeddingJobStatusSchema,
  stage: knowledgeEmbeddingStageSchema.nullable(),
  progress: z.number().int().min(0).max(100),
  attemptCount: z.number().int().nonnegative(),
  errorMessage: z.string().max(2_000).nullable(),
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
})
export type KnowledgeEmbeddingJob = z.infer<
  typeof knowledgeEmbeddingJobSchema
>

/** 单次上传/版本的异步索引状态，供前端轮询 */
export const knowledgeDocumentStatusSchema = z.object({
  document: knowledgeDocSchema,
  version: knowledgeDocumentVersionSchema.nullable(),
  job: knowledgeEmbeddingJobSchema.nullable(),
})
export type KnowledgeDocumentStatus = z.infer<
  typeof knowledgeDocumentStatusSchema
>

export const knowledgeDocumentStatusQuerySchema = z.strictObject({
  versionNo: z.coerce.number().int().min(1).optional(),
})
export type KnowledgeDocumentStatusQuery = z.infer<
  typeof knowledgeDocumentStatusQuerySchema
>

/** 同名/重复内容冲突详情（放在错误信封 details 中） */
export const knowledgeNameConflictDetailsSchema = z.object({
  reason: z.literal('same_name'),
  candidates: z
    .array(
      z.object({
        documentId: apiIdSchema,
        title: z.string().min(1).max(512),
        fileName: z.string().max(512),
        currentVersionNo: z.number().int().positive().optional(),
      }),
    )
    .max(10),
})
export type KnowledgeNameConflictDetails = z.infer<
  typeof knowledgeNameConflictDetailsSchema
>

export const knowledgeContentDuplicateDetailsSchema = z.object({
  reason: z.literal('duplicate_content'),
  existing: z.object({
    documentId: apiIdSchema,
    title: z.string().min(1).max(512),
    versionNo: z.number().int().positive(),
  }),
})
export type KnowledgeContentDuplicateDetails = z.infer<
  typeof knowledgeContentDuplicateDetailsSchema
>

export const knowledgeUploadConflictDetailsSchema = z.discriminatedUnion(
  'reason',
  [knowledgeNameConflictDetailsSchema, knowledgeContentDuplicateDetailsSchema],
)
export type KnowledgeUploadConflictDetails = z.infer<
  typeof knowledgeUploadConflictDetailsSchema
>

export const knowledgeSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(2_000),
  limit: z.coerce.number().int().min(1).max(20).optional(),
})
export type KnowledgeSearchQuery = z.infer<typeof knowledgeSearchQuerySchema>

export const knowledgeSearchHitSchema = z.object({
  documentId: apiIdSchema,
  title: z.string().min(1).max(512),
  category: knowledgeDocCategorySchema,
  fileType: knowledgeDocFileTypeSchema,
  chunkIndex: z.number().int().nonnegative(),
  content: z.string().min(1).max(20_000),
  score: z.number().min(-1).max(1),
  updatedAt: isoDateTimeSchema,
  /** 命中所属版本号（只返回当前版本） */
  versionNo: z.number().int().positive().optional(),
})
export type KnowledgeSearchHit = z.infer<typeof knowledgeSearchHitSchema>

export const knowledgeSearchResultSchema = z.object({
  query: z.string().min(1),
  hits: z.array(knowledgeSearchHitSchema),
})
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>
