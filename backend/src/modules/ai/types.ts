import type {
  AiChatRequest,
  AiChatResponse,
  AiChatSource,
  AiConversation,
  AiConversationCreatePayload,
  AiConversationHistory,
  AiConversationHistoryQuery,
  AiConversationSummary,
  AiHistoryMessage,
  AiKnowledgeStatus,
  AiMessageSendPayload,
  AiMessageSendResult,
  AiStreamEvent,
} from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'

/** 模型调用结果（由独立 Python 服务返回） */
export interface AiModelCompletion {
  message: { role: string; content: string }
  model: string
}

/** 统一模型调用接口；会话编排层只依赖它 */
export type AiModelStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; finishReason: 'stop' | 'length'; model?: string }

export interface AiModelClient {
  complete(input: {
    systemContent: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    temperature?: number
  }): Promise<AiModelCompletion>

  /** 流式生成；signal 中止时实现方应立即取消上游请求 */
  stream(
    input: {
      systemContent: string
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      temperature?: number
    },
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<AiModelStreamEvent>
}

/** 旧的无状态 AI 对话接口（保留兼容） */
export interface AiChatService extends AiModelClient {
  chat(auth: AuthContext, payload: AiChatRequest): Promise<AiChatResponse>
}

/** 持久化 AI 会话服务 */
export interface AiConversationService {
  listConversations(auth: AuthContext): Promise<AiConversation[]>
  createConversation(
    auth: AuthContext,
    payload: AiConversationCreatePayload,
  ): Promise<AiConversation>
  history(
    auth: AuthContext,
    conversationId: string,
    query: AiConversationHistoryQuery,
  ): Promise<AiConversationHistory>
  sendMessage(
    auth: AuthContext,
    conversationId: string,
    payload: AiMessageSendPayload,
  ): Promise<AiMessageSendResult>
  /** 流式发送；客户端断开时通过 signal 取消上游并保存部分内容 */
  chatStream(
    auth: AuthContext,
    conversationId: string,
    payload: AiMessageSendPayload,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<AiStreamEvent>
  deleteConversation(auth: AuthContext, conversationId: string): Promise<boolean>
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

// ---------------------------------------------------------------------------
// 会话持久化记录
// ---------------------------------------------------------------------------

export type AiMessageRole = 'user' | 'assistant'
export type AiMessageStatus = 'streaming' | 'completed' | 'failed' | 'interrupted'

export interface AiConversationRecord {
  id: string
  publicId: string
  title: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  createdAt: string
  updatedAt: string
}

export interface AiMessageRecord {
  id: string
  publicId: string
  conversationId: string
  role: AiMessageRole
  content: string
  clientMessageId: string | null
  replyToMessageId: string | null
  modelName: string | null
  sources: AiChatSource[]
  knowledgeStatus: AiKnowledgeStatus | null
  status: AiMessageStatus
  errorCode: string | null
  createdAt: string
  updatedAt: string
}

export interface AiSummaryRecord {
  id: string
  summaryNo: number
  content: string
  coveredMessageId: string
  coveredMessagePublicId: string | null
  promptVersion: string
  modelName: string | null
  createdAt: string
}

export interface CreateAiUserMessageInput {
  publicId: string
  content: string
  clientMessageId?: string
}

export interface CreateAiAssistantMessageInput {
  publicId: string
  replyToMessageId: string
}

export interface UpdateAiAssistantMessageInput {
  content: string
  modelName?: string
  sources?: AiChatSource[]
  knowledgeStatus?: AiKnowledgeStatus | null
  status: AiMessageStatus
  errorCode?: string | null
}

export interface CreateAiSummaryInput {
  summary: string
  coveredMessageId: string
  promptVersion: string
  modelName?: string
}

export interface AiMessagePage {
  messages: AiMessageRecord[]
  hasMore: boolean
}

/** ai 模块的数据访问接口（MySQL 实现，测试可替换） */
export interface AiChatRepository {
  createConversation(
    tenantId: string,
    employeeId: string,
    title: string,
  ): Promise<AiConversationRecord>

  listConversations(
    tenantId: string,
    employeeId: string,
  ): Promise<AiConversationRecord[]>

  findConversation(
    tenantId: string,
    employeeId: string,
    publicId: string,
  ): Promise<AiConversationRecord | null>

  archiveConversation(
    tenantId: string,
    employeeId: string,
    publicId: string,
  ): Promise<boolean>

  /** 更新最后消息时间与列表预览 */
  touchConversation(
    tenantId: string,
    conversationId: string,
    preview: string,
    at: Date,
  ): Promise<void>

  /** 会话仍为默认标题时，用首条用户消息生成标题 */
  updateTitleIfDefault(
    tenantId: string,
    conversationId: string,
    title: string,
  ): Promise<void>

  /** 按客户端幂等 ID 查询用户消息 */
  findUserMessageByClientId(
    tenantId: string,
    conversationId: string,
    clientMessageId: string,
  ): Promise<AiMessageRecord | null>

  /** 查询某条用户消息对应的助手消息 */
  findAssistantByUserMessageId(
    tenantId: string,
    conversationId: string,
    userMessageId: string,
  ): Promise<AiMessageRecord | null>

  /** 幂等插入用户消息 */
  createUserMessage(
    tenantId: string,
    conversationId: string,
    input: CreateAiUserMessageInput,
  ): Promise<AiMessageRecord>

  /** 插入 assistant 占位消息（streaming） */
  createAssistantMessage(
    tenantId: string,
    conversationId: string,
    input: CreateAiAssistantMessageInput,
  ): Promise<AiMessageRecord>

  updateAssistantMessage(
    tenantId: string,
    messageId: string,
    input: UpdateAiAssistantMessageInput,
  ): Promise<void>

  /** 历史消息分页：按 created_at/id 倒序取 limit+1 条后反转为正序 */
  listMessages(
    tenantId: string,
    conversationId: string,
    options: { limit: number; beforePublicId?: string },
  ): Promise<AiMessagePage>

  /** 上下文构建：摘要边界之后最近的 limit 条消息（正序） */
  listRecentMessagesAfter(
    tenantId: string,
    conversationId: string,
    afterMessageId: string,
    limit: number,
  ): Promise<AiMessageRecord[]>

  /** 摘要生成：摘要边界之后最早的 limit 条消息（正序） */
  listMessagesAfter(
    tenantId: string,
    conversationId: string,
    afterMessageId: string,
    limit: number,
  ): Promise<AiMessageRecord[]>

  getLatestSummary(
    tenantId: string,
    conversationId: string,
  ): Promise<AiSummaryRecord | null>

  createSummary(
    tenantId: string,
    conversationId: string,
    input: CreateAiSummaryInput,
  ): Promise<AiSummaryRecord>

  /** 把超时仍未完成的 streaming 消息标记为 interrupted */
  markStaleStreamingMessages(
    tenantId: string,
    conversationId: string,
    staleBefore: Date,
  ): Promise<void>
}

/** 历史记录 → 契约消息 */
export function toHistoryMessage(record: AiMessageRecord): AiHistoryMessage {
  return {
    id: record.publicId,
    role: record.role,
    content: record.content,
    sources: record.sources,
    ...(record.modelName ? { model: record.modelName } : {}),
    ...(record.knowledgeStatus
      ? { knowledgeStatus: record.knowledgeStatus }
      : {}),
    status: record.status,
    createdAt: record.createdAt,
  }
}

/** 摘要记录 → 契约摘要 */
export function toConversationSummary(
  record: AiSummaryRecord,
): AiConversationSummary {
  return {
    content: record.content,
    summaryNo: record.summaryNo,
    ...(record.coveredMessagePublicId
      ? { coveredMessageId: record.coveredMessagePublicId }
      : {}),
    ...(record.modelName ? { model: record.modelName } : {}),
    createdAt: record.createdAt,
  }
}
