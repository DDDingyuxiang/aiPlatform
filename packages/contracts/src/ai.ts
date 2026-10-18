/**
 * AI 对话契约（业务后端 ↔ AI 服务 ↔ 前端共用）。
 *
 * 对话历史由调用方传入；模型输出始终视为不可信输入，
 * 后端只返回非流式文本，后续可扩展为流式响应。
 */
import { z } from 'zod'

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

export const aiChatResponseSchema = z.object({
  message: aiChatMessageSchema,
  /** 实际使用的模型标识，便于排查与展示 */
  model: z.string().min(1).max(128),
})
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>
