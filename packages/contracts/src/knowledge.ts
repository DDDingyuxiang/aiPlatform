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
})
export type KnowledgeDoc = z.infer<typeof knowledgeDocSchema>

/** 上传元数据（查询参数；文件本体放在请求体中） */
export const knowledgeUploadQuerySchema = z.strictObject({
  title: z.string().trim().min(1).max(255),
  category: knowledgeDocCategorySchema.default('policy'),
  /** 多个标签用英文或中文逗号分隔 */
  tags: z.string().trim().max(512).optional(),
  fileName: z.string().trim().min(1).max(512),
})
export type KnowledgeUploadQuery = z.infer<typeof knowledgeUploadQuerySchema>

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
})
export type KnowledgeSearchHit = z.infer<typeof knowledgeSearchHitSchema>

export const knowledgeSearchResultSchema = z.object({
  query: z.string().min(1),
  hits: z.array(knowledgeSearchHitSchema),
})
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>
