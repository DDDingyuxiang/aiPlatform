import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAiService } from '../service.js'
import { iterateNdjson, openSse, writeSse } from '../stream.js'

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('流式传输工具', () => {
  it('跨 chunk 拼接完整的 NDJSON 行', async () => {
    const response = streamResponse(['{"a":1}\n{"a"', ':2}\n', '{"a":3}'])
    const lines: string[] = []
    for await (const line of iterateNdjson(response)) lines.push(line)
    expect(lines).toEqual(['{"a":1}', '{"a":2}', '{"a":3}'])
  })

  it('按 SSE 格式写出事件', () => {
    const chunks: string[] = []
    const headers: Record<string, string> = {}
    const res = {
      status() {
        return this
      },
      setHeader(key: string, value: string) {
        headers[key] = value
        return this
      },
      flushHeaders() {},
      write(chunk: string) {
        chunks.push(chunk)
        return true
      },
      writableEnded: false,
      destroyed: false,
    }
    const stop = openSse(res as never, 60_000)
    writeSse(res as never, 'delta', { type: 'delta', content: '你好' })
    stop()
    expect(headers['Content-Type']).toContain('text/event-stream')
    expect(headers['X-Accel-Buffering']).toBe('no')
    expect(chunks.join('')).toBe(
      'event: delta\ndata: {"type":"delta","content":"你好"}\n\n',
    )
  })
})

describe('AI 流式适配器', () => {
  it('把上游 NDJSON 转成 delta/done 事件', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamResponse([
          '{"type":"meta","model":"qwen"}\n',
          '{"type":"delta","content":"你"}\n',
          '{"type":"delta","content":"好"}\n',
          '{"type":"done","finishReason":"stop","model":"qwen"}\n',
        ]),
      ),
    )

    const service = createAiService({
      serviceUrl: 'http://ai.test',
      timeoutMs: 5_000,
    })
    const events: unknown[] = []
    for await (const event of service.stream({
      systemContent: '系统提示',
      messages: [{ role: 'user', content: '你好' }],
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'delta', content: '你' },
      { type: 'delta', content: '好' },
      { type: 'done', finishReason: 'stop', model: 'qwen' },
    ])
  })

  it('上游 error 事件转换为 503', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamResponse([
          '{"type":"error","message":"模型不可用"}\n',
        ]),
      ),
    )

    const service = createAiService({
      serviceUrl: 'http://ai.test',
      timeoutMs: 5_000,
    })
    await expect(async () => {
      for await (const _event of service.stream({
        systemContent: '系统提示',
        messages: [{ role: 'user', content: '你好' }],
      })) {
        // 消费到 error 时抛错
      }
    }).rejects.toMatchObject({ status: 503 })
  })
})
