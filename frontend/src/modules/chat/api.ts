/** 对话接口（经统一 HTTP 客户端，开发环境由 mock.ts 拦截） */
import { http } from '@/core/http'
import type { Conversation, CreateConversationPayload, Message, SendMessagePayload } from './types'

export const chatApi = {
  conversations: () => http.get<Conversation[]>('/chat/conversations'),
  messages: (conversationId: string) =>
    http.get<Message[]>(`/chat/conversations/${conversationId}/messages`),
  createConversation: (payload: CreateConversationPayload) =>
    http.post<Conversation>('/chat/conversations', payload),
  sendMessage: (conversationId: string, payload: SendMessagePayload) =>
    http.post<Message>(`/chat/conversations/${conversationId}/messages`, payload),
}
