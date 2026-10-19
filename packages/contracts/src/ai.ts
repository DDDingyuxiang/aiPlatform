/**
 * AI 对话契约（业务后端 ↔ AI 服务 ↔ 前端共用）。
 *
 * 两类接口并存：
 * - 旧 `POST /ai/chat`：无状态、由调用方传入历史，保留兼容；
 * - 新会话接口：服务端持久化会话与消息，支持历史恢复、预算与摘要。
 *
 * 模型输出始终视为不可信输入，后端只返回校验后的文本。
 */
import { z } from 'zod'
import { apiIdSchema, isoDateTimeSchema } from './common.js'

export const aiChatRoleSchema = z.enum(['system', 'user', 'assistant'])
export type AiChatRole = z.infer<typeof aiChatRoleSchema>

export const aiChatMessageSchema = z.object({
  role: aiChatRoleSchema,
  content: z.string().trim().min(1).max(8_000),
})
export type AiChatMessage = z.infer<typeof aiChatMessageSchema>

/** 发起 AI 对话（最多 20 条历史，避免过长上下文；旧接口） */
export const aiChatRequestSchema = z.strictObject({
  messages: z.array(aiChatMessageSchema).min(1).max(20),
  temperature: z.number().min(0).max(2).optional(),
})
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>

/** RAG 引用来源：只暴露文档公开 ID、标题与得分 */
export const aiChatSourceSchema = z.object({
  documentId: apiIdSchema,
  title: z.string().min(1).max(512),
  score: z.number().min(-1).max(1),
  excerpt: z.string().max(2_000).optional(),
})
export type AiChatSource = z.infer<typeof aiChatSourceSchema>

/**
 * 知识库检索状态：
 * - used：检索成功且命中资料
 * - empty：检索成功但没有匹配资料
 * - unavailable：检索服务失败/超时，本次回答未使用知识库
 * - disabled：未启用知识库检索
 * - unknown：历史消息或无法判定
 */
export const aiKnowledgeStatusSchema = z.enum([
  'used',
  'empty',
  'unavailable',
  'disabled',
  'unknown',
])
export type AiKnowledgeStatus = z.infer<typeof aiKnowledgeStatusSchema>

export const aiChatResponseSchema = z.object({
  message: aiChatMessageSchema,
  /** 实际使用的模型标识，便于排查与展示 */
  model: z.string().min(1).max(128),
  /** 本次回答引用的企业知识库文档 */
  sources: z.array(aiChatSourceSchema).max(10).default([]),
  /** 知识库检索状态；旧客户端可忽略 */
  knowledgeStatus: aiKnowledgeStatusSchema.optional(),
})
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>

// ---------------------------------------------------------------------------
// 持久化 AI 会话
// ---------------------------------------------------------------------------

/** AI 消息角色：历史接口不返回 system */
export const aiConversationRoleSchema = z.enum(['user', 'assistant'])
export type AiConversationRole = z.infer<typeof aiConversationRoleSchema>

export const aiConversationMessageStatusSchema = z.enum([
  'streaming',
  'completed',
  'failed',
  'interrupted',
])
export type AiConversationMessageStatus = z.infer<
  typeof aiConversationMessageStatusSchema
>

/** 会话列表项 */
export const aiConversationSchema = z.object({
  id: apiIdSchema,
  title: z.string().min(1).max(255),
  /** 最后一条消息预览，供列表展示 */
  lastMessage: z.string().max(255),
  updatedAt: isoDateTimeSchema,
})
export type AiConversation = z.infer<typeof aiConversationSchema>

/** 新建会话（标题可选，默认“新对话”） */
export const aiConversationCreateSchema = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
})
export type AiConversationCreatePayload = z.infer<
  typeof aiConversationCreateSchema
>

/** 发送一条用户消息 */
export const aiMessageSendSchema = z.strictObject({
  content: z.string().trim().min(1).max(8_000),
  /** 客户端幂等 ID：网络重试时复用同一条用户消息 */
  clientMessageId: z.string().trim().min(1).max(64).optional(),
  temperature: z.number().min(0).max(2).optional(),
})
export type AiMessageSendPayload = z.infer<typeof aiMessageSendSchema>

/** 历史消息查询参数 */
export const aiConversationHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  /** 游标：返回该消息之前的更早消息 */
  before: apiIdSchema.optional(),
})
export type AiConversationHistoryQuery = z.infer<
  typeof aiConversationHistoryQuerySchema
>

/** 历史消息 */
export const aiHistoryMessageSchema = z.object({
  id: apiIdSchema,
  role: aiConversationRoleSchema,
  content: z.string().max(16_000),
  sources: z.array(aiChatSourceSchema).max(10).default([]),
  model: z.string().min(1).max(128).optional(),
  status: aiConversationMessageStatusSchema,
  /** 该回答的知识库检索状态；历史消息可能为空 */
  knowledgeStatus: aiKnowledgeStatusSchema.optional(),
  createdAt: isoDateTimeSchema,
})
export type AiHistoryMessage = z.infer<typeof aiHistoryMessageSchema>

/** 滚动摘要（AI 生成，前端明确标注来源） */
export const aiConversationSummarySchema = z.object({
  content: z.string().min(1).max(5_000),
  summaryNo: z.number().int().positive(),
  /** 摘要覆盖到的边界消息公开 ID */
  coveredMessageId: apiIdSchema.optional(),
  model: z.string().min(1).max(128).optional(),
  createdAt: isoDateTimeSchema,
})
export type AiConversationSummary = z.infer<
  typeof aiConversationSummarySchema
>

/** 历史消息响应 */
export const aiConversationHistorySchema = z.object({
  conversation: aiConversationSchema,
  messages: z.array(aiHistoryMessageSchema),
  summary: aiConversationSummarySchema.nullable(),
  hasMore: z.boolean(),
})
export type AiConversationHistory = z.infer<
  typeof aiConversationHistorySchema
>

/** 非流式发送响应 */
export const aiMessageSendResultSchema = z.object({
  conversation: aiConversationSchema,
  userMessage: aiHistoryMessageSchema,
  assistantMessage: aiHistoryMessageSchema,
  model: z.string().min(1).max(128),
  sources: z.array(aiChatSourceSchema).max(10).default([]),
})
export type AiMessageSendResult = z.infer<typeof aiMessageSendResultSchema>

/** 删除会话响应 */
export const aiConversationDeleteResultSchema = z.object({
  deleted: z.boolean(),
})
export type AiConversationDeleteResult = z.infer<
  typeof aiConversationDeleteResultSchema
>

// ---------------------------------------------------------------------------
// 流式对话事件（业务后端 → 前端 SSE）
// ---------------------------------------------------------------------------

export const aiStreamEventTypeSchema = z.enum([
  'meta',
  'sources',
  'delta',
  'done',
  'error',
])
export type AiStreamEventType = z.infer<typeof aiStreamEventTypeSchema>

/** 建立流后立即发送：前端据此拿到服务端消息 ID */
export const aiStreamMetaEventSchema = z.object({
  type: z.literal('meta'),
  conversationId: apiIdSchema,
  userMessageId: apiIdSchema,
  assistantMessageId: apiIdSchema,
  summaryApplied: z.boolean(),
})
export type AiStreamMetaEvent = z.infer<typeof aiStreamMetaEventSchema>

/** RAG 检索完成后发送引用来源与检索状态 */
export const aiStreamSourcesEventSchema = z.object({
  type: z.literal('sources'),
  sources: z.array(aiChatSourceSchema).max(10),
  status: aiKnowledgeStatusSchema,
})
export type AiStreamSourcesEvent = z.infer<typeof aiStreamSourcesEventSchema>

/** 增量正文；不包含 thinking 内容 */
export const aiStreamDeltaEventSchema = z.object({
  type: z.literal('delta'),
  content: z.string().min(1).max(16_000),
})
export type AiStreamDeltaEvent = z.infer<typeof aiStreamDeltaEventSchema>

/** 生成完成；content 为最终权威内容 */
export const aiStreamDoneEventSchema = z.object({
  type: z.literal('done'),
  assistantMessageId: apiIdSchema,
  content: z.string().max(16_000),
  model: z.string().min(1).max(128),
  finishReason: z.enum(['stop', 'length']),
  /** 最终知识库检索状态 */
  knowledgeStatus: aiKnowledgeStatusSchema,
  firstTokenMs: z.number().int().nonnegative().optional(),
  elapsedMs: z.number().int().nonnegative().optional(),
})
export type AiStreamDoneEvent = z.infer<typeof aiStreamDoneEventSchema>

/** 生成失败；连接已建立后只能以事件形式返回错误 */
export const aiStreamErrorEventSchema = z.object({
  type: z.literal('error'),
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(512),
  retryable: z.boolean(),
  assistantMessageId: apiIdSchema.optional(),
})
export type AiStreamErrorEvent = z.infer<typeof aiStreamErrorEventSchema>

export const aiStreamEventSchema = z.discriminatedUnion('type', [
  aiStreamMetaEventSchema,
  aiStreamSourcesEventSchema,
  aiStreamDeltaEventSchema,
  aiStreamDoneEventSchema,
  aiStreamErrorEventSchema,
])
export type AiStreamEvent = z.infer<typeof aiStreamEventSchema>
