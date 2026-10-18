/** 对话接口（经统一 HTTP 客户端；真实后端为 /api/v1/chat） */
import { http } from '@/core/http'
import type {
  ChatMessage,
  Conversation,
  CreateConversationPayload,
  SendMessagePayload,
} from './types'

function attachmentPath(conversationId: string, attachmentId: string): string {
  return `/chat/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachmentId)}`
}

export const chatApi = {
  conversations: () => http.get<Conversation[]>('/chat/conversations'),

  messages: (conversationId: string) =>
    http.get<ChatMessage[]>(
      `/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    ),

  createConversation: (payload: CreateConversationPayload) =>
    http.post<Conversation>('/chat/conversations', payload),

  sendMessage: (conversationId: string, payload: SendMessagePayload) =>
    http.post<ChatMessage>(
      `/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      payload,
    ),

  /**
   * 发送附件：请求体为文件二进制。
   *
   * 真实 MIME 通过 X-File-Type 传递，Content-Type 固定为 octet-stream，
   * 避免后端 JSON 解析器误处理 application/json 类型的文件。
   */
  uploadAttachment: (conversationId: string, file: File, caption?: string) =>
    http.post<ChatMessage>(
      `/chat/conversations/${encodeURIComponent(conversationId)}/attachments`,
      file,
      {
        params: { fileName: file.name, caption },
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Type': file.type || 'application/octet-stream',
        },
        timeoutMs: 120_000,
      },
    ),

  /** 附件下载需要携带 Bearer 令牌，因此由客户端取回 Blob 后再落盘/预览 */
  downloadAttachment: (conversationId: string, attachmentId: string) =>
    http.getBlob(attachmentPath(conversationId, attachmentId)),
}
