import type { AiChatRequest, AiChatResponse } from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'

/** AI 能力服务接口（由独立的 Python 服务实现） */
export interface AiChatService {
  chat(auth: AuthContext, payload: AiChatRequest): Promise<AiChatResponse>
}

/** 文本向量化接口（由独立 AI 服务的 BGE-M3 实现） */
export interface EmbeddingService {
  /** 返回与输入顺序一致的向量；实现方负责分批与超时 */
  embed(texts: string[]): Promise<number[][]>
}

/** 供 AI 对话使用的知识片段（由 knowledge 模块提供） */
export interface AiKnowledgeChunk {
  documentId: string
  title: string
  content: string
  score: number
}

/** AI 模块只依赖这个最小检索接口，避免反向依赖 knowledge 内部实现 */
export interface KnowledgeRetriever {
  retrieve(
    auth: AuthContext,
    query: string,
    limit: number,
  ): Promise<AiKnowledgeChunk[]>
}
