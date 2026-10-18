import type { AiChatRequest, AiChatResponse } from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'

/** AI 能力服务接口（由独立的 Python 服务实现） */
export interface AiChatService {
  chat(auth: AuthContext, payload: AiChatRequest): Promise<AiChatResponse>
}
