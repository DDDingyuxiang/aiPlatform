/**
 * AI 对话契约（业务后端 ↔ AI 服务 ↔ 前端共用）。
 *
 * 对话历史由调用方传入；模型输出始终视为不可信输入，
 * 后端只返回非流式文本，后续可扩展为流式响应。
 */
import { z } from 'zod'
import { apiIdSchema } from './common.js'

export const aiChatRoleSchema = z.enum(['system', 'user', 'assistant'])
export type AiChatRole = z.infer<typeof aiChatRoleSchema>

export const aiChatMessageSchema = z.object({
  role: aiChatRoleSchema,
  content: z.string().trim().min(1).max(8_000),
})
export type AiChatMessage = z.infer<typeof aiChatMessageSchema>

/** 发起 AI 对话（最多 20 条历史，避免过长上下文） */
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

export const aiChatResponseSchema = z.object({
  message: aiChatMessageSchema,
  /** 实际使用的模型标识，便于排查与展示 */
  model: z.string().min(1).max(128),
  /** 本次回答引用的企业知识库文档 */
  sources: z.array(aiChatSourceSchema).max(10).default([]),
})
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>
