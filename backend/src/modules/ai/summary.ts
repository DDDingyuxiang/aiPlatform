/**
 * 对话滚动摘要。
 *
 * 摘要异步生成，不阻塞回复；同一会话串行处理，避免与聊天争抢本地模型。
 * 摘要失败只记录日志，不推进边界，上下文构建会退化为按预算截断历史。
 */
import type { Logger } from '../../shared/logger.js'
import { estimateTokens } from './context.js'
import type { AiChatRepository, AiSummaryRecord } from './types.js'

export interface SummaryServiceOptions {
  serviceUrl: string
  repository: AiChatRepository
  logger?: Logger
  enabled: boolean
  timeoutMs: number
  triggerTokens: number
  keepRecentMessages: number
  maxChars: number
}

export interface SummaryService {
  /** 助手消息完成后调用；满足阈值时异步生成摘要 */
  schedule(tenantId: string, conversationId: string): void
  /** 等待当前队列清空（测试/优雅退出使用） */
  drain(): Promise<void>
}

interface SummarizeResponse {
  summary?: string
  model?: string
}

const SUMMARY_PROMPT_VERSION = 'v1'
/** 一次从数据库读取的最大候选消息数 */
const MAX_SUMMARY_SOURCE_MESSAGES = 200
/** Python 摘要接口单次最多接收 40 条消息 */
const MAX_SUMMARY_INPUT_MESSAGES = 40
/** 单次摘要输入字符上限，避免超过模型上下文 */
const MAX_SUMMARY_INPUT_CHARS = 6_000

export function createSummaryService(
  options: SummaryServiceOptions,
): SummaryService {
  const {
    serviceUrl,
    repository,
    logger,
    enabled,
    timeoutMs,
    triggerTokens,
    keepRecentMessages,
    maxChars,
  } = options

  const queued = new Set<string>()
  let tail: Promise<void> = Promise.resolve()

  async function requestSummary(
    previousSummary: string | undefined,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<SummarizeResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${serviceUrl}/v1/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(previousSummary ? { previousSummary } : {}),
          messages,
          maxChars,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`摘要服务返回 HTTP ${response.status}`)
      }
      return (await response.json()) as SummarizeResponse
    } finally {
      clearTimeout(timer)
    }
  }

  async function generate(
    tenantId: string,
    conversationId: string,
  ): Promise<void> {
    const latestSummary = await repository.getLatestSummary(
      tenantId,
      conversationId,
    )
    const boundary = latestSummary?.coveredMessageId ?? '0'
    const messages = await repository.listMessagesAfter(
      tenantId,
      conversationId,
      boundary,
      MAX_SUMMARY_SOURCE_MESSAGES,
    )
    // 只摘要“最近保留窗口”之前的消息，并限制单次输入条数；
    // 余下更早的消息等下一次触发继续摘要，避免请求体超限。
    const candidates = messages
      .slice(0, Math.max(0, messages.length - keepRecentMessages))
      .slice(0, MAX_SUMMARY_INPUT_MESSAGES)
    if (candidates.length === 0) return

    const estimated = candidates.reduce(
      (sum, message) => sum + estimateTokens(message.content),
      0,
    )
    if (estimated < triggerTokens && candidates.length <= 20) return

    // 只把用户与助手的有效文本送入摘要，忽略空内容；同时限制总字符数
    const selected: typeof candidates = []
    let inputChars = 0
    for (const message of candidates) {
      if (!message.content.trim()) continue
      if (
        selected.length > 0 &&
        inputChars + message.content.length > MAX_SUMMARY_INPUT_CHARS
      ) {
        break
      }
      selected.push(message)
      inputChars += message.content.length
    }
    if (selected.length === 0) return
    const compact = selected.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    const response = await requestSummary(latestSummary?.content, compact)
    const summary = response.summary?.trim()
    if (!summary) {
      throw new Error('摘要服务返回空内容')
    }

    const covered = selected.at(-1)
    if (!covered) return
    const created: AiSummaryRecord = await repository.createSummary(
      tenantId,
      conversationId,
      {
        summary: summary.slice(0, maxChars),
        coveredMessageId: covered.id,
        promptVersion: SUMMARY_PROMPT_VERSION,
        modelName: response.model,
      },
    )
    logger?.info('ai.summary_created', {
      tenantId,
      conversationId,
      summaryNo: created.summaryNo,
      coveredMessageId: created.coveredMessageId,
      summarizedMessages: compact.length,
      estimatedInputTokens: estimated,
    })
  }

  return {
    schedule(tenantId, conversationId) {
      if (!enabled) return
      const key = `${tenantId}:${conversationId}`
      if (queued.has(key)) return
      queued.add(key)
      tail = tail
        .then(() => generate(tenantId, conversationId))
        .catch((error: unknown) => {
          logger?.warn('ai.summary_failed', {
            tenantId,
            conversationId,
            error: error instanceof Error ? error.message : String(error),
          })
        })
        .finally(() => {
          queued.delete(key)
        })
    },

    async drain() {
      await tail
    },
  }
}
