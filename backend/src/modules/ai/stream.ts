/**
 * 流式传输工具：读取上游 NDJSON、向前端写 SSE。
 *
 * Python AI 服务使用 NDJSON（逐行 JSON），Express 转成浏览器友好的 SSE。
 */
import type { Response as ExpressResponse } from 'express'

/** 逐行读取上游 NDJSON；行缓冲跨 chunk 保留，避免半行解析 */
export async function* iterateNdjson(
  response: globalThis.Response,
): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error('上游响应没有可读流')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let separator = buffer.indexOf('\n')
      while (separator >= 0) {
        const line = buffer.slice(0, separator).replace(/\r$/, '').trim()
        buffer = buffer.slice(separator + 1)
        if (line) yield line
        separator = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    const tail = buffer.trim()
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

/** 回调风格的行读取，便于测试与非生成器场景 */
export async function readNdjson(
  response: globalThis.Response,
  onLine: (line: string) => void,
): Promise<void> {
  for await (const line of iterateNdjson(response)) {
    onLine(line)
  }
}

/** 建立 SSE 响应头并启动心跳；返回停止心跳的函数 */
export function openSse(
  res: ExpressResponse,
  heartbeatMs = 15_000,
): () => void {
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const timer = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(': ping\n\n')
    }
  }, heartbeatMs)
  timer.unref?.()
  return () => clearInterval(timer)
}

export function writeSse(
  res: ExpressResponse,
  event: string,
  payload: unknown,
): void {
  if (res.writableEnded || res.destroyed) return
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

export function closeSse(res: ExpressResponse): void {
  if (!res.writableEnded && !res.destroyed) res.end()
}
