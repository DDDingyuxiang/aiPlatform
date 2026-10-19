import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '../../../http/errors.js'
import { createAiService } from '../service.js'

const auth = { tenantId: '1', employeeId: '2', publicId: 'p-1' }

function createService() {
  return createAiService({
    serviceUrl: 'http://ai.test',
    timeoutMs: 5_000,
    systemPrompt: '系统提示',
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI service proxy', () => {
  it('转发系统提示与对话历史，并校验模型输出', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: { role: 'assistant', content: '你好，我是 AI。' },
          model: 'qwen3-local',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createService().chat(auth, {
      messages: [{ role: 'user', content: '你好' }],
      temperature: 0.3,
    })

    expect(result.message.content).toBe('你好，我是 AI。')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://ai.test/v1/chat')
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>
      temperature: number
    }
    expect(body.messages[0]?.role).toBe('system')
    expect(body.messages[0]?.content).toContain('系统提示')
    expect(body.messages[0]?.content).toContain('未启用企业知识库检索')
    expect(body.messages[1]).toEqual({ role: 'user', content: '你好' })
    expect(body.temperature).toBe(0.3)
  })

  it('AI 服务非 2xx 时返回 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })),
    )

    await expect(
      createService().chat(auth, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE, status: 503 })
  })

  it('模型返回格式异常时返回 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: { role: 'assistant' } }), {
            status: 200,
          }),
      ),
    )

    await expect(
      createService().chat(auth, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ status: 502 })
  })

  it('把知识库检索结果注入系统提示并返回引用来源', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: { role: 'assistant', content: '一线城市住宿上限为 600 元。' },
          model: 'qwen3-local',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = createAiService({
      serviceUrl: 'http://ai.test',
      timeoutMs: 5_000,
      systemPrompt: '系统提示',
      retriever: {
        retrieve: vi.fn(async () => [
          {
            documentId: 'doc-1',
            title: '差旅费用报销标准',
            content: '一线城市每晚上限 600 元。',
            score: 0.82,
          },
        ]),
      },
    })

    const result = await service.chat(auth, {
      messages: [{ role: 'user', content: '住宿费上限是多少？' }],
    })

    expect(result.sources).toEqual([
      {
        documentId: 'doc-1',
        title: '差旅费用报销标准',
        score: 0.82,
        excerpt: '一线城市每晚上限 600 元。',
      },
    ])
    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>
    }
    expect(body.messages[0]?.content).toContain('差旅费用报销标准')
    expect(body.messages[0]?.content).toContain('一线城市每晚上限 600 元')
  })

  it('检索失败或相似度过低时退化为普通对话', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: { role: 'assistant', content: '普通回答' },
            model: 'qwen3-local',
          }),
          { status: 200 },
        ),
      ),
    )

    const failed = createAiService({
      serviceUrl: 'http://ai.test',
      timeoutMs: 5_000,
      retriever: {
        retrieve: vi.fn(async () => {
          throw new Error('qdrant down')
        }),
      },
    })
    await expect(
      failed.chat(auth, { messages: [{ role: 'user', content: '你好' }] }),
    ).resolves.toMatchObject({ sources: [] })

    const lowScore = createAiService({
      serviceUrl: 'http://ai.test',
      timeoutMs: 5_000,
      retriever: {
        retrieve: vi.fn(async () => [
          {
            documentId: 'doc-1',
            title: '无关文档',
            content: '无关内容',
            score: 0.1,
          },
        ]),
      },
    })
    await expect(
      lowScore.chat(auth, { messages: [{ role: 'user', content: '你好' }] }),
    ).resolves.toMatchObject({ sources: [] })
  })

  it('请求超时返回 504', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }),
    )

    await expect(
      createService().chat(auth, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ status: 504 })
  })
})
