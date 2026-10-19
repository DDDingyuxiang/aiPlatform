import { describe, expect, it } from 'vitest'
import { buildContext, estimateTokens, truncateToTokens } from '../context.js'

const options = {
  maxTokens: 1_000,
  overheadTokens: 100,
  historyMessages: 32,
  ragContextChars: 500,
  summaryMaxChars: 200,
}

describe('AI 上下文预算', () => {
  it('中文 token 估算高于同长度英文', () => {
    expect(estimateTokens('你好世界')).toBeGreaterThan(
      estimateTokens('abcd'),
    )
    expect(estimateTokens('   \n  ')).toBe(0)
  })

  it('按预算裁剪历史并保留当前用户消息', () => {
    const history = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `第 ${index} 条历史消息`.repeat(20),
    }))
    const current = { role: 'user' as const, content: '这是当前问题' }

    const built = buildContext({
      systemPrompt: '你是企业助手。',
      knowledgeContext: '企业制度资料。'.repeat(80),
      summary: '早前讨论了差旅标准。'.repeat(20),
      messages: [...history, current],
      options,
    })

    expect(built.historyMessages).toBeLessThan(history.length)
    expect(built.messages.at(-1)).toEqual(current)
    expect(built.messages[0]?.role).toBe('user')
    expect(built.systemContent).toContain('较早对话摘要')
    expect(built.systemContent).toContain('资料')
    expect(built.estimatedTokens).toBeLessThanOrEqual(options.maxTokens)
  })

  it('当前问题过长时截断并标记', () => {
    const built = buildContext({
      systemPrompt: '你是企业助手。',
      messages: [{ role: 'user', content: '很长的背景说明。'.repeat(1_000) }],
      options: { ...options, ragContextChars: 0, summaryMaxChars: 0 },
    })

    expect(built.truncated).toBe(true)
    expect(built.messages.at(-1)?.content).toContain('内容已截断')
  })

  it('不保留孤立的 assistant 历史', () => {
    const built = buildContext({
      systemPrompt: '你是企业助手。',
      messages: [
        { role: 'assistant', content: '上一条回答'.repeat(10) },
        { role: 'user', content: '上一轮问题' },
        { role: 'user', content: '当前问题' },
      ],
      options: { ...options, ragContextChars: 0, summaryMaxChars: 0 },
    })

    expect(built.messages[0]?.role).toBe('user')
  })

  it('按 token 预算截断文本', () => {
    const result = truncateToTokens('你好世界'.repeat(100), 10)
    expect(result.truncated).toBe(true)
    expect(estimateTokens(result.text)).toBeLessThanOrEqual(10)
    expect(truncateToTokens('短文本', 100)).toEqual({
      text: '短文本',
      truncated: false,
    })
  })

  it('知识库未命中或不可用时注入明确的状态提示', () => {
    const base = {
      systemPrompt: '你是企业助手。',
      messages: [{ role: 'user' as const, content: '公司报销标准是什么？' }],
      options: { ...options, ragContextChars: 0, summaryMaxChars: 0 },
    }

    const empty = buildContext({ ...base, knowledgeStatus: 'empty' })
    expect(empty.systemContent).toContain('未找到与问题匹配的资料')
    expect(empty.systemContent).toContain('不要声称引用了内部文档')

    const unavailable = buildContext({
      ...base,
      knowledgeStatus: 'unavailable',
    })
    expect(unavailable.systemContent).toContain('检索服务不可用')
    expect(unavailable.systemContent).toContain('未使用企业知识库')

    const used = buildContext({ ...base, knowledgeStatus: 'used' })
    expect(used.systemContent).not.toContain('检索服务不可用')
    expect(used.systemContent).not.toContain('未找到与问题匹配的资料')
  })
})
