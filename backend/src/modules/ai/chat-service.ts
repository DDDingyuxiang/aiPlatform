/**
 * 持久化 AI 会话编排。
 *
 * 负责：会话归属校验、消息落库、上下文预算、RAG 注入、滚动摘要触发。
 * 模型调用统一委托给 AiModelClient，本层不直接依赖 Ollama。
 */
import {
  aiChatResponseSchema,
  aiMessageSendResultSchema,
  type AiChatSource,
  type AiConversation,
  type AiConversationCreatePayload,
  type AiConversationHistory,
  type AiConversationHistoryQuery,
  type AiKnowledgeStatus,
  type AiMessageSendPayload,
  type AiMessageSendResult,
  type AiStreamEvent,
} from '@aiplatform/contracts'
import { ulid } from 'ulid'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { Logger } from '../../shared/logger.js'
import type { AuthContext } from '../identity/index.js'
import { buildContext, type BuiltContext } from './context.js'
import { buildKnowledgeContext, SYSTEM_PROMPT, toSources } from './service.js'
import type { SummaryService } from './summary.js'
import {
  toConversationSummary,
  toHistoryMessage,
  type AiChatRepository,
  type AiConversationRecord,
  type AiConversationService,
  type AiKnowledgeChunk,
  type AiMessageRecord,
  type AiModelClient,
  type AiSummaryRecord,
  type KnowledgeRetriever,
} from './types.js'

export interface AiContextConfig {
  maxTokens: number
  overheadTokens: number
  historyMessages: number
  ragContextChars: number
  summaryMaxChars: number
}

export interface AiConversationServiceOptions {
  repository: AiChatRepository
  model: AiModelClient
  summary: SummaryService
  retriever?: KnowledgeRetriever
  logger?: Logger
  systemPrompt?: string
  knowledgeLimit: number
  knowledgeMinScore: number
  ragTimeoutMs: number
  context: AiContextConfig
  pageSize: number
  streamStaleMs: number
}

interface PreparedTurn {
  conversation: AiConversationRecord
  userMessage: AiMessageRecord
  assistant: AiMessageRecord
  latestSummary: AiSummaryRecord | null
  /** 幂等重试：助手消息已经成功生成过 */
  completed: boolean
}

interface KnowledgeRetrieval {
  status: AiKnowledgeStatus
  chunks: AiKnowledgeChunk[]
}

interface TurnContext {
  sources: AiChatSource[]
  built: BuiltContext
  knowledgeStatus: AiKnowledgeStatus
}

function toConversation(record: AiConversationRecord): AiConversation {
  return {
    id: record.publicId,
    title: record.title,
    lastMessage: record.lastMessagePreview ?? '',
    updatedAt: record.lastMessageAt ?? record.updatedAt,
  }
}

function conversationNotFound(): AppError {
  return new AppError(ErrorCode.NOT_FOUND, '会话不存在', 404)
}

export function createAiConversationService(
  options: AiConversationServiceOptions,
): AiConversationService {
  const {
    repository,
    model,
    summary: summaryService,
    retriever,
    logger,
    systemPrompt = SYSTEM_PROMPT,
    knowledgeLimit,
    knowledgeMinScore,
    ragTimeoutMs,
    context,
    pageSize,
    streamStaleMs,
  } = options

  async function requireConversation(
    auth: AuthContext,
    publicId: string,
  ): Promise<AiConversationRecord> {
    const conversation = await repository.findConversation(
      auth.tenantId,
      auth.employeeId,
      publicId,
    )
    if (!conversation) throw conversationNotFound()
    return conversation
  }

  async function markStale(
    tenantId: string,
    conversation: AiConversationRecord,
  ): Promise<void> {
    await repository.markStaleStreamingMessages(
      tenantId,
      conversation.id,
      new Date(Date.now() - streamStaleMs),
    )
  }

  /** RAG 检索有独立预算；超时/失败时降级为普通对话，不拖住首字 */
  async function retrieveKnowledge(
    auth: AuthContext,
    query: string,
  ): Promise<KnowledgeRetrieval> {
    if (!retriever || !query.trim()) {
      return { status: 'disabled', chunks: [] }
    }
    let timer: NodeJS.Timeout | undefined
    let timedOut = false
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true
        resolve(null)
      }, ragTimeoutMs)
    })
    try {
      const chunks = await Promise.race([
        retriever.retrieve(auth, query, knowledgeLimit),
        timeout,
      ])
      if (chunks === null || timedOut) {
        logger?.warn('ai.knowledge_retrieval_timeout', {
          tenantId: auth.tenantId,
          timeoutMs: ragTimeoutMs,
        })
        return { status: 'unavailable', chunks: [] }
      }
      const filtered = chunks
        .filter((chunk) => chunk.score >= knowledgeMinScore)
        .sort((left, right) => right.score - left.score)
        .slice(0, knowledgeLimit)
      return {
        status: filtered.length > 0 ? 'used' : 'empty',
        chunks: filtered,
      }
    } catch (error) {
      logger?.warn('ai.knowledge_retrieval_failed', {
        tenantId: auth.tenantId,
        error: error instanceof Error ? error.message : String(error),
      })
      return { status: 'unavailable', chunks: [] }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  function assistantResult(
    conversation: AiConversationRecord,
    userMessage: AiMessageRecord,
    assistant: AiMessageRecord,
  ): AiMessageSendResult {
    return aiMessageSendResultSchema.parse({
      conversation: toConversation(conversation),
      userMessage: toHistoryMessage(userMessage),
      assistantMessage: toHistoryMessage(assistant),
      model: assistant.modelName ?? 'unknown',
      sources: assistant.sources,
    })
  }

  /**
   * 准备一轮对话：校验会话、幂等写入用户消息、创建/复用助手占位消息。
   * 不包含 RAG 与模型调用，便于流式路径在检索前先返回 meta。
   */
  async function prepareTurn(
    auth: AuthContext,
    conversationId: string,
    payload: AiMessageSendPayload,
  ): Promise<PreparedTurn> {
    const conversation = await requireConversation(auth, conversationId)
    await markStale(auth.tenantId, conversation)

    let userMessage = payload.clientMessageId
      ? await repository.findUserMessageByClientId(
          auth.tenantId,
          conversation.id,
          payload.clientMessageId,
        )
      : null
    let assistant = userMessage
      ? await repository.findAssistantByUserMessageId(
          auth.tenantId,
          conversation.id,
          userMessage.id,
        )
      : null

    const latestSummary = await repository.getLatestSummary(
      auth.tenantId,
      conversation.id,
    )

    // 幂等：同一 clientMessageId 已成功生成过，直接复用原结果
    if (
      userMessage &&
      assistant &&
      assistant.status === 'completed' &&
      assistant.content.trim()
    ) {
      return {
        conversation,
        userMessage,
        assistant,
        latestSummary,
        completed: true,
      }
    }

    if (!userMessage) {
      userMessage = await repository.createUserMessage(
        auth.tenantId,
        conversation.id,
        {
          publicId: ulid(),
          content: payload.content,
          clientMessageId: payload.clientMessageId,
        },
      )
      await repository.updateTitleIfDefault(
        auth.tenantId,
        conversation.id,
        payload.content.replace(/\s+/g, ' ').slice(0, 40),
      )
    }

    if (!assistant) {
      assistant = await repository.createAssistantMessage(
        auth.tenantId,
        conversation.id,
        { publicId: ulid(), replyToMessageId: userMessage.id },
      )
    } else {
      // 上次失败/中断：复用原助手消息重新生成，避免历史里出现重复回答
      await repository.updateAssistantMessage(
        auth.tenantId,
        assistant.id,
        { content: '', status: 'streaming', errorCode: null },
      )
      assistant = {
        ...assistant,
        content: '',
        status: 'streaming',
        errorCode: null,
        modelName: null,
        sources: [],
      }
    }

    await repository.touchConversation(
      auth.tenantId,
      conversation.id,
      payload.content,
      new Date(),
    )

    return {
      conversation,
      userMessage,
      assistant,
      latestSummary,
      completed: false,
    }
  }

  /** 检索知识库并组装模型上下文 */
  async function buildTurnContext(
    auth: AuthContext,
    conversation: AiConversationRecord,
    query: string,
    latestSummary: AiSummaryRecord | null,
  ): Promise<TurnContext> {
    const retrieval = await retrieveKnowledge(auth, query)
    const knowledgeChunks = retrieval.chunks
    const sources: AiChatSource[] = toSources(knowledgeChunks)
    const boundary = latestSummary?.coveredMessageId ?? '0'
    const recent = await repository.listRecentMessagesAfter(
      auth.tenantId,
      conversation.id,
      boundary,
      context.historyMessages * 2,
    )
    const history = recent
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({ role: message.role, content: message.content }))
    const built = buildContext({
      systemPrompt,
      knowledgeContext: buildKnowledgeContext(
        knowledgeChunks,
        context.ragContextChars,
      ),
      knowledgeStatus: retrieval.status,
      summary: latestSummary?.content,
      messages: history,
      options: {
        maxTokens: context.maxTokens,
        overheadTokens: context.overheadTokens,
        historyMessages: context.historyMessages,
        ragContextChars: context.ragContextChars,
        summaryMaxChars: context.summaryMaxChars,
      },
    })
    return { sources, built, knowledgeStatus: retrieval.status }
  }

  async function finishAssistant(
    auth: AuthContext,
    conversation: AiConversationRecord,
    assistant: AiMessageRecord,
    content: string,
    modelName: string,
    sources: AiChatSource[],
    knowledgeStatus: AiKnowledgeStatus,
  ): Promise<AiMessageRecord> {
    await repository.updateAssistantMessage(auth.tenantId, assistant.id, {
      content,
      modelName,
      sources,
      knowledgeStatus,
      status: 'completed',
    })
    await repository.touchConversation(
      auth.tenantId,
      conversation.id,
      content,
      new Date(),
    )
    summaryService.schedule(auth.tenantId, conversation.id)
    return {
      ...assistant,
      content,
      modelName,
      sources,
      knowledgeStatus,
      status: 'completed',
      errorCode: null,
    }
  }

  function errorCodeOf(error: unknown): string {
    return error instanceof AppError
      ? String(error.code)
      : 'AI_SERVICE_UNAVAILABLE'
  }

  async function markAssistant(
    auth: AuthContext,
    assistantId: string,
    content: string,
    status: 'failed' | 'interrupted',
    knowledgeStatus: AiKnowledgeStatus,
    errorCode?: string,
  ): Promise<void> {
    await repository
      .updateAssistantMessage(auth.tenantId, assistantId, {
        content,
        knowledgeStatus,
        status,
        errorCode: errorCode ?? null,
      })
      .catch((markError: unknown) => {
        logger?.error('ai.mark_failed_error', {
          tenantId: auth.tenantId,
          error:
            markError instanceof Error ? markError.message : String(markError),
        })
      })
  }

  return {
    async listConversations(auth) {
      const records = await repository.listConversations(
        auth.tenantId,
        auth.employeeId,
      )
      return records.map(toConversation)
    },

    async createConversation(auth, payload: AiConversationCreatePayload) {
      const title = payload.title?.trim() || '新对话'
      const record = await repository.createConversation(
        auth.tenantId,
        auth.employeeId,
        title,
      )
      return toConversation(record)
    },

    async history(auth, conversationId, query: AiConversationHistoryQuery) {
      const conversation = await requireConversation(auth, conversationId)
      await markStale(auth.tenantId, conversation)
      const page = await repository.listMessages(
        auth.tenantId,
        conversation.id,
        {
          limit: query.limit ?? pageSize,
          beforePublicId: query.before,
        },
      )
      const latestSummary = await repository.getLatestSummary(
        auth.tenantId,
        conversation.id,
      )
      return {
        conversation: toConversation(conversation),
        // 失败/中断且没有内容的助手消息不进入历史，避免刷新后出现空气泡
        messages: page.messages
          .filter(
            (message) =>
              !(
                message.role === 'assistant' &&
                (message.status === 'failed' ||
                  message.status === 'interrupted') &&
                !message.content.trim()
              ),
          )
          .map(toHistoryMessage),
        summary: latestSummary ? toConversationSummary(latestSummary) : null,
        hasMore: page.hasMore,
      } satisfies AiConversationHistory
    },

    async sendMessage(auth, conversationId, payload: AiMessageSendPayload) {
      const turn = await prepareTurn(auth, conversationId, payload)
      if (turn.completed) {
        return assistantResult(
          turn.conversation,
          turn.userMessage,
          turn.assistant,
        )
      }

      const started = Date.now()
      let knowledgeStatusForError: AiKnowledgeStatus = 'unknown'
      try {
        const { sources, built, knowledgeStatus } = await buildTurnContext(
          auth,
          turn.conversation,
          payload.content,
          turn.latestSummary,
        )
        knowledgeStatusForError = knowledgeStatus
        const completion = await model.complete({
          systemContent: built.systemContent,
          messages: built.messages,
          temperature: payload.temperature,
        })

        const parsed = aiChatResponseSchema.safeParse({
          message: completion.message,
          model: completion.model,
          sources,
        })
        if (!parsed.success) {
          logger?.error('ai.invalid_response', {
            tenantId: auth.tenantId,
            employeeId: auth.employeeId,
            issues: parsed.error.issues.map((issue) => issue.path.join('.')),
          })
          throw new AppError(
            ErrorCode.SERVICE_UNAVAILABLE,
            'AI 服务返回格式异常',
            502,
          )
        }

        const completed = await finishAssistant(
          auth,
          turn.conversation,
          turn.assistant,
          parsed.data.message.content,
          parsed.data.model,
          sources,
          knowledgeStatus,
        )
        logger?.info('ai.chat_completed', {
          tenantId: auth.tenantId,
          employeeId: auth.employeeId,
          conversationId: turn.conversation.publicId,
          messages: built.historyMessages,
          estimatedPromptTokens: built.estimatedTokens,
          ragChars: built.ragChars,
          summaryApplied: Boolean(turn.latestSummary),
          truncated: built.truncated,
          elapsedMs: Date.now() - started,
        })

        const fresh =
          (await repository.findConversation(
            auth.tenantId,
            auth.employeeId,
            turn.conversation.publicId,
          )) ?? turn.conversation
        return assistantResult(fresh, turn.userMessage, completed)
      } catch (error) {
        await markAssistant(
          auth,
          turn.assistant.id,
          '',
          'failed',
          knowledgeStatusForError,
          errorCodeOf(error),
        )
        throw error
      }
    },

    async *chatStream(
      auth,
      conversationId,
      payload,
      streamOptions = {},
    ): AsyncGenerator<AiStreamEvent> {
      const turn = await prepareTurn(auth, conversationId, payload)
      const { conversation, userMessage, assistant, latestSummary } = turn

      yield {
        type: 'meta',
        conversationId: conversation.publicId,
        userMessageId: userMessage.publicId,
        assistantMessageId: assistant.publicId,
        summaryApplied: Boolean(latestSummary),
      }

      if (turn.completed) {
        const completedStatus = assistant.knowledgeStatus ?? 'unknown'
        yield {
          type: 'sources',
          sources: assistant.sources,
          status: completedStatus,
        }
        yield {
          type: 'done',
          assistantMessageId: assistant.publicId,
          content: assistant.content,
          model: assistant.modelName ?? 'unknown',
          finishReason: 'stop',
          knowledgeStatus: completedStatus,
        }
        return
      }

      const started = Date.now()
      let content = ''
      let modelName = ''
      let firstTokenMs: number | undefined
      let finishReason: 'stop' | 'length' = 'stop'
      let knowledgeStatus: AiKnowledgeStatus = 'unknown'
      let finalized = false
      let lastPersistAt = 0
      let lastPersistLength = 0

      try {
        const {
          sources,
          built,
          knowledgeStatus: retrievalStatus,
        } = await buildTurnContext(
          auth,
          conversation,
          payload.content,
          latestSummary,
        )
        knowledgeStatus = retrievalStatus
        yield { type: 'sources', sources, status: knowledgeStatus }

        for await (const event of model.stream(
          {
            systemContent: built.systemContent,
            messages: built.messages,
            temperature: payload.temperature,
          },
          { signal: streamOptions.signal },
        )) {
          if (streamOptions.signal?.aborted) break
          if (event.type === 'delta') {
            if (firstTokenMs === undefined) {
              firstTokenMs = Date.now() - started
            }
            content += event.content
            yield { type: 'delta', content: event.content }

            const now = Date.now()
            if (
              now - lastPersistAt >= 2_000 ||
              content.length - lastPersistLength >= 500
            ) {
              lastPersistAt = now
              lastPersistLength = content.length
              // 定期落库部分内容，进程崩溃时也能保留已生成文本
              await repository
                .updateAssistantMessage(auth.tenantId, assistant.id, {
                  content,
                  knowledgeStatus,
                  status: 'streaming',
                })
                .catch(() => undefined)
            }
          } else {
            finishReason = event.finishReason
            if (event.model) modelName = event.model
          }
        }

        if (!content.trim()) {
          throw new AppError(
            ErrorCode.SERVICE_UNAVAILABLE,
            'AI 服务未返回内容',
            502,
          )
        }

        const parsed = aiChatResponseSchema.safeParse({
          message: { role: 'assistant', content },
          model: modelName || 'unknown',
          sources,
        })
        if (!parsed.success) {
          throw new AppError(
            ErrorCode.SERVICE_UNAVAILABLE,
            'AI 服务返回格式异常',
            502,
          )
        }

        await finishAssistant(
          auth,
          conversation,
          assistant,
          parsed.data.message.content,
          parsed.data.model,
          sources,
          knowledgeStatus,
        )
        finalized = true
        yield {
          type: 'done',
          assistantMessageId: assistant.publicId,
          content: parsed.data.message.content,
          model: parsed.data.model,
          finishReason,
          knowledgeStatus,
          ...(firstTokenMs === undefined ? {} : { firstTokenMs }),
          elapsedMs: Date.now() - started,
        }
        logger?.info('ai.chat_stream_completed', {
          tenantId: auth.tenantId,
          employeeId: auth.employeeId,
          conversationId: conversation.publicId,
          messages: built.historyMessages,
          estimatedPromptTokens: built.estimatedTokens,
          summaryApplied: Boolean(latestSummary),
          knowledgeStatus,
          firstTokenMs,
          elapsedMs: Date.now() - started,
        })
      } catch (error) {
        if (streamOptions.signal?.aborted) {
          await markAssistant(
            auth,
            assistant.id,
            content,
            'interrupted',
            knowledgeStatus,
          )
          finalized = true
          return
        }
        await markAssistant(
          auth,
          assistant.id,
          content,
          'failed',
          knowledgeStatus,
          errorCodeOf(error),
        )
        finalized = true
        const appError = error instanceof AppError ? error : null
        logger?.warn('ai.chat_stream_failed', {
          tenantId: auth.tenantId,
          conversationId: conversation.publicId,
          error: error instanceof Error ? error.message : String(error),
          partialChars: content.length,
        })
        yield {
          type: 'error',
          code: appError ? String(appError.code) : 'AI_SERVICE_UNAVAILABLE',
          message: appError?.message ?? 'AI 服务暂不可用',
          retryable: true,
          assistantMessageId: assistant.publicId,
        }
      } finally {
        // 客户端断开时生成器可能被 return，这里兜底保存已生成部分
        if (!finalized) {
          await markAssistant(
            auth,
            assistant.id,
            content,
            'interrupted',
            knowledgeStatus,
          )
        }
      }
    },

    async deleteConversation(auth, conversationId) {
      const deleted = await repository.archiveConversation(
        auth.tenantId,
        auth.employeeId,
        conversationId,
      )
      if (!deleted) throw conversationNotFound()
      return true
    },
  }
}
