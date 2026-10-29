/** AI 对话接口：统一经业务后端代理到本地模型服务 */
import { aiStreamEventSchema } from '@aiplatform/contracts'
import { http } from '@/core/http'
import type {
  AiConversation,
  AiConversationHistory,
  AiMessageSendPayload,
  AiMessageSendResult,
  AiSummaryHistoryItem,
  AiStreamEvent,
} from './types'

function parseStreamEvent(raw: string): AiStreamEvent | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = aiStreamEventSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const aiApi = {
  listConversations: () => http.get<AiConversation[]>('/ai/conversations'),

  listSummaryHistory: () =>
    http.get<AiSummaryHistoryItem[]>('/ai/summaries'),

  createConversation: () =>
    http.post<AiConversation>('/ai/conversations', {}),

  history: (
    conversationId: string,
    params?: { limit?: number; before?: string },
  ) =>
    http.get<AiConversationHistory>(
      `/ai/conversations/${encodeURIComponent(conversationId)}/messages`,
      { params },
    ),

  sendMessage: (conversationId: string, payload: AiMessageSendPayload) =>
    http.post<AiMessageSendResult>(
      `/ai/conversations/${encodeURIComponent(conversationId)}/messages`,
      payload,
      {
        // 本地小模型首次加载可能较慢，超时时间与后端保持一致
        timeoutMs: 180_000,
      },
    ),

  /** 流式发送：事件已按共享契约校验 */
  sendMessageStream: (
    conversationId: string,
    payload: AiMessageSendPayload,
    onEvent: (event: AiStreamEvent) => void,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ) =>
    http.postSse(
      `/ai/conversations/${encodeURIComponent(conversationId)}/messages/stream`,
      payload,
      (event) => {
        if (event.event === 'ping') return
        const parsed = parseStreamEvent(event.data)
        if (parsed) onEvent(parsed)
      },
      options,
    ),

  deleteConversation: (conversationId: string) =>
    http.delete<{ deleted: boolean }>(
      `/ai/conversations/${encodeURIComponent(conversationId)}`,
    ),
}
