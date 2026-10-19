/**
 * AI 上下文预算。
 *
 * 目标：在固定输入 token 预算内，按“系统提示 → 当前问题 → 摘要 → 知识库 → 最近历史”
 * 的优先级组装消息，避免把整段长对话直接塞给模型。
 *
 * token 估算采用保守启发式：中文约 0.8 token/字，其他非空白字符约 0.3 token/字。
 * 不依赖具体模型 tokenizer，误差由预算余量吸收。
 */
import type { AiKnowledgeStatus } from '@aiplatform/contracts'

export interface ContextBudgetOptions {
  /** 单次请求允许的输入 token 上限 */
  maxTokens: number
  /** chat template、角色标记等固定开销 */
  overheadTokens: number
  /** 历史消息条数上限 */
  historyMessages: number
  /** 知识库资料字符上限 */
  ragContextChars: number
  /** 摘要字符上限 */
  summaryMaxChars: number
}

export interface ContextMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BuildContextInput {
  systemPrompt: string
  knowledgeContext?: string
  /** 检索状态；用于明确告诉模型本次是否使用了企业知识库 */
  knowledgeStatus?: AiKnowledgeStatus
  summary?: string | null
  /** 按时间正序；最后一条通常是当前用户消息 */
  messages: ContextMessage[]
  options: ContextBudgetOptions
}

/**
 * 知识库未命中/不可用时注入系统提示，明确约束模型不得暗示引用了内部资料。
 */
export function knowledgeStatusNotice(status: AiKnowledgeStatus): string {
  switch (status) {
    case 'empty':
      return [
        '[企业知识库检索结果]',
        '本次知识库检索已成功完成，但未找到与问题匹配的资料。',
        '请基于通用知识回答；不要声称引用了内部文档，也不要编造内部制度、数据或来源。',
      ].join('\n')
    case 'unavailable':
      return [
        '[企业知识库检索状态]',
        '本次企业知识库检索服务不可用，回答未使用企业知识库。',
        '请基于通用知识回答；不要声称引用了内部文档，也不要编造内部资料。',
      ].join('\n')
    case 'disabled':
      return [
        '[企业知识库检索状态]',
        '本次未启用企业知识库检索。',
        '请基于通用知识回答；不要声称引用了内部文档。',
      ].join('\n')
    default:
      return ''
  }
}

export interface BuiltContext {
  systemContent: string
  messages: ContextMessage[]
  estimatedTokens: number
  historyMessages: number
  /** 知识库/摘要/历史或当前问题是否发生过截断 */
  truncated: boolean
  ragChars: number
  summaryChars: number
}

const CJK_PATTERN =
  /[㐀-䶿一-鿿぀-ヿ가-힯豈-﫿]/

/** 保守估算文本 token 数 */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const char of text) {
    if (/\s/.test(char)) continue
    if (CJK_PATTERN.test(char)) cjk += 1
    else other += 1
  }
  return Math.ceil(cjk * 0.8 + other * 0.3)
}

/** 按 token 预算截断文本，返回截断后的内容与是否截断 */
export function truncateToTokens(
  text: string,
  tokenBudget: number,
): { text: string; truncated: boolean } {
  if (tokenBudget <= 0) return { text: '', truncated: text.length > 0 }
  if (estimateTokens(text) <= tokenBudget) return { text, truncated: false }

  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (estimateTokens(text.slice(0, middle)) <= tokenBudget) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  return {
    text: text.slice(0, low),
    truncated: low < text.length,
  }
}

const TRUNCATED_MARK = '\n（内容已截断）'

/**
 * 组装发给模型的消息。
 *
 * 预算顺序：
 * 1. 固定系统提示；
 * 2. 当前用户消息（必须保留，极端情况下截断）；
 * 3. 最新摘要（最多 30% 剩余预算）；
 * 4. 知识库资料（最多 45% 剩余预算）；
 * 5. 最近历史（从新到旧按整条装入，不保留孤立 assistant）。
 */
export function buildContext(input: BuildContextInput): BuiltContext {
  const { systemPrompt, knowledgeContext = '', knowledgeStatus, summary, messages, options } = input
  const budget = Math.max(0, options.maxTokens - options.overheadTokens)

  const systemTokens = estimateTokens(systemPrompt)
  let remaining = Math.max(0, budget - systemTokens)
  let truncated = false

  const current = messages.at(-1)
  const hasCurrentUser = current?.role === 'user'
  // 为当前问题预留最多一半预算，保证它不会被历史挤掉
  const currentTokens = hasCurrentUser ? estimateTokens(current.content) : 0
  const reserveCurrent = hasCurrentUser
    ? Math.min(currentTokens, Math.max(100, Math.floor(budget * 0.5)))
    : 0
  remaining = Math.max(0, remaining - reserveCurrent)

  // 摘要：最多剩余预算的 30%
  let summaryContent = (summary ?? '').slice(0, options.summaryMaxChars)
  const summaryBudget = Math.floor(remaining * 0.3)
  if (summaryContent) {
    const result = truncateToTokens(summaryContent, summaryBudget)
    summaryContent = result.text
    truncated ||= result.truncated
  }
  remaining = Math.max(0, remaining - estimateTokens(summaryContent))

  // 知识库：最多剩余预算的 45%，并受字符上限约束
  let knowledge = knowledgeContext.slice(0, options.ragContextChars)
  const knowledgeBudget = Math.floor(remaining * 0.45)
  if (knowledge) {
    const result = truncateToTokens(knowledge, knowledgeBudget)
    knowledge = result.text
    truncated ||= result.truncated
  }
  remaining = Math.max(0, remaining - estimateTokens(knowledge))

  // 除当前问题外的历史，从新到旧装入
  const historySource = hasCurrentUser ? messages.slice(0, -1) : messages.slice()
  const selected: ContextMessage[] = []
  let historyTokens = 0
  for (let index = historySource.length - 1; index >= 0; index -= 1) {
    if (selected.length >= options.historyMessages) break
    const message = historySource[index]!
    if (!message.content.trim()) continue
    const tokens = estimateTokens(message.content)
    if (historyTokens + tokens > remaining) continue
    selected.push(message)
    historyTokens += tokens
  }
  selected.reverse()
  // 不保留孤立 assistant（历史从 assistant 开始会破坏对话结构）
  while (selected.length > 0 && selected[0]!.role === 'assistant') {
    selected.shift()
  }

  const resultMessages: ContextMessage[] = [...selected]
  if (hasCurrentUser) {
    const available = Math.max(100, remaining - historyTokens + reserveCurrent)
    const result = truncateToTokens(current.content, available)
    resultMessages.push({ role: 'user', content: result.text + (result.truncated ? TRUNCATED_MARK : '') })
    truncated ||= result.truncated
  }

  const sections = [systemPrompt]
  const statusNotice = knowledgeStatus
    ? knowledgeStatusNotice(knowledgeStatus)
    : ''
  if (statusNotice) {
    sections.push(statusNotice)
  }
  if (summaryContent) {
    sections.push(`[较早对话摘要]\n${summaryContent}`)
  }
  if (knowledge) {
    sections.push(knowledge)
  }
  const systemContent = sections.join('\n\n')

  const estimatedTokens =
    options.overheadTokens +
    estimateTokens(systemContent) +
    resultMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0)

  return {
    systemContent,
    messages: resultMessages,
    estimatedTokens,
    historyMessages: selected.length,
    truncated,
    ragChars: knowledge.length,
    summaryChars: summaryContent.length,
  }
}
