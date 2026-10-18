/** AI 对话接口：统一经业务后端代理到本地模型服务 */
import { http } from '@/core/http'
import type { AiChatRequest, AiChatResponse } from './types'

export const aiApi = {
  chat: (payload: AiChatRequest) =>
    http.post<AiChatResponse>('/ai/chat', payload, {
      // 本地小模型首次加载可能较慢，超时时间与后端保持一致
      timeoutMs: 180_000,
    }),
}
