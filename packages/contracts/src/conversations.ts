/**
 * 对话模块契约（私聊/群聊、消息与附件）。
 *
 * 约定：
 * - 会话成员与消息发送者一律使用员工 public_id；
 * - 消息正文与附件分开：附件本体存文件存储，接口只返回元数据；
 * - 附件下载必须经过鉴权接口，不使用可公开猜测的静态 URL。
 */
import { z } from 'zod'
import { apiIdSchema, isoDateTimeSchema } from './common.js'

export const conversationTypeSchema = z.enum(['direct', 'group'])
export type ConversationType = z.infer<typeof conversationTypeSchema>

export const chatMessageTypeSchema = z.enum(['text', 'image', 'file', 'system'])
export type ChatMessageType = z.infer<typeof chatMessageTypeSchema>

/** 会话参与者 */
export const chatParticipantSchema = z.object({
  id: apiIdSchema,
  name: z.string().min(1).max(128),
})
export type ChatParticipant = z.infer<typeof chatParticipantSchema>

/** 消息附件元数据（文件本体通过鉴权下载接口获取） */
export const messageAttachmentSchema = z.object({
  id: apiIdSchema,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().nonnegative(),
})
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>

/** 会话摘要 */
export const conversationSchema = z.object({
  id: apiIdSchema,
  type: conversationTypeSchema,
  /** 私聊为对方姓名；群聊为群名称 */
  name: z.string().max(255),
  /** 含当前用户的全部参与者 */
  participants: z.array(chatParticipantSchema),
  /** 当前用户未读数（首期未实现回执，固定为 0） */
  unread: z.number().int().nonnegative(),
  /** ISO 8601 */
  updatedAt: isoDateTimeSchema,
  /** 列表预览文案 */
  lastMessage: z.string(),
})
export type Conversation = z.infer<typeof conversationSchema>

/** 聊天消息 */
export const chatMessageSchema = z.object({
  id: apiIdSchema,
  conversationId: apiIdSchema,
  senderId: apiIdSchema,
  content: z.string(),
  type: chatMessageTypeSchema,
  attachments: z.array(messageAttachmentSchema),
  sentAt: isoDateTimeSchema,
})
export type ChatMessage = z.infer<typeof chatMessageSchema>

/** 创建会话：直接传成员 public_id，不含自己 */
export const createConversationSchema = z.strictObject({
  memberIds: z.array(apiIdSchema).min(1).max(50),
})
export type CreateConversationPayload = z.infer<typeof createConversationSchema>

/** 发送文字消息 */
export const sendMessageSchema = z.strictObject({
  content: z.string().trim().min(1).max(5000),
})
export type SendMessagePayload = z.infer<typeof sendMessageSchema>

/** 附件上传查询参数（文件本体放请求体，元数据放查询串） */
export const uploadAttachmentQuerySchema = z.strictObject({
  fileName: z.string().trim().min(1).max(255),
  caption: z.string().trim().max(5000).optional(),
})
export type UploadAttachmentQuery = z.infer<typeof uploadAttachmentQuerySchema>
