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
    expect(body.messages[0]).toEqual({ role: 'system', content: '系统提示' })
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
