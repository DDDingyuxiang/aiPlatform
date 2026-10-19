import { afterEach, describe, expect, it, vi } from 'vitest'
import { http } from '../index'

function sseResponse(parts: string[], status = 200): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part))
        controller.close()
      },
    }),
    { status, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST SSE', () => {
  it('跨 chunk 拼接事件并逐条回调', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'event: delta\ndata: {"a":',
          '1}\n\n',
          'event: done\ndata: {"b":2}\n\n',
          ': ping\n\n',
        ]),
      ),
    )

    const events: Array<{ event: string; data: string }> = []
    await http.postSse(
      '/ai/test',
      { content: 'hi' },
      (event) => events.push(event),
      {},
    )

    expect(events).toEqual([
      { event: 'delta', data: '{"a":1}' },
      { event: 'done', data: '{"b":2}' },
    ])
  })

  it('非 2xx 响应按统一信封抛出 ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: 40400,
              data: null,
              message: '会话不存在',
              requestId: 'req-1',
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    )

    await expect(
      http.postSse('/ai/test', {}, () => undefined, {}),
    ).rejects.toMatchObject({ code: 40400, status: 404 })
  })
})
