/**
 * HTTP 客户端：统一封装请求前缀、鉴权头、超时、错误规整与 Mock 拦截。
 *
 * - 成功时直接返回信封中的 data；失败统一抛出 ApiError（含稳定错误码与 requestId）；
 * - 业务模块不得绕过本客户端直接调用 fetch；
 * - 禁止在此处拼业务逻辑，只做传输层职责。
 */
import { appConfig } from '@/core/config'
import { clearToken, getToken } from '@/core/auth/token'
import { genId } from '@/shared/utils/id'
import { isMockFailure, matchMock } from './mock'
import {
  ApiError,
  SUCCESS_CODE,
  type ApiEnvelope,
  type HttpMethod,
  type RequestOptions,
  type ServerSentEvent,
} from './types'

const DEFAULT_TIMEOUT_MS = 15_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const base = appConfig.app.apiBaseUrl.replace(/\/+$/, '')
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  if (!params) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.append(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${url}?${qs}` : url
}

function toApiError(error: unknown, requestId: string): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('请求超时，请稍后重试', { code: -2, status: 0, requestId })
  }
  return new ApiError(error instanceof Error ? error.message : '网络异常', {
    code: -3,
    status: 0,
    requestId,
  })
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const requestId = genId('req')
  const token = getToken()

  // ---- Mock 拦截（仅开发/演示配置开启时） ----
  if (appConfig.features.mockApi) {
    const matched = matchMock(method, path)
    if (matched) {
      await sleep(matched.route.delayMs)
      const query: Record<string, string> = {}
      for (const [key, value] of Object.entries(options.params ?? {})) {
        if (value !== undefined && value !== null && value !== '') query[key] = String(value)
      }
      const result = await matched.route.handler({
        body,
        query,
        params: matched.params,
        token,
        requestId,
      })
      if (isMockFailure(result)) {
        throw new ApiError(result.message, { code: result.code, status: result.status, requestId })
      }
      return result as T
    }
  }

  // ---- 真实请求 ----
  // Blob（文件上传）直接作为请求体，不经过 JSON 序列化
  const isBlobBody = typeof Blob !== 'undefined' && body instanceof Blob
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(buildUrl(path, options.params), {
      method,
      headers: {
        ...(isBlobBody ? {} : { 'Content-Type': 'application/json' }),
        'X-Request-Id': requestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: body === undefined ? undefined : isBlobBody ? body : JSON.stringify(body),
      signal: options.signal ?? controller.signal,
    })

    if (response.status === 401) {
      // 令牌失效：清除本地凭证，由路由守卫在下一次导航时引导重新登录
      clearToken()
    }

    const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null
    if (!envelope || typeof envelope.code !== 'number') {
      throw new ApiError(`响应格式错误（HTTP ${response.status}）`, {
        code: -1,
        status: response.status,
        requestId,
      })
    }
    if (!response.ok || envelope.code !== SUCCESS_CODE) {
      throw new ApiError(envelope.message || `HTTP ${response.status}`, {
        code: envelope.code,
        status: response.status,
        requestId: envelope.requestId || requestId,
        details: envelope.details,
      })
    }
    return envelope.data
  } catch (error) {
    throw toApiError(error, requestId)
  } finally {
    clearTimeout(timer)
  }
}

/** 下载二进制资源（附件等）；失败响应仍按统一信封解析错误文案 */
async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const requestId = genId('req')
  const token = getToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(buildUrl(path, options.params), {
      method: 'GET',
      headers: {
        'X-Request-Id': requestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal: options.signal ?? controller.signal,
    })

    if (response.status === 401) clearToken()

    if (!response.ok) {
      const envelope = (await response.json().catch(() => null)) as ApiEnvelope<null> | null
      throw new ApiError(envelope?.message || `HTTP ${response.status}`, {
        code: envelope?.code ?? -1,
        status: response.status,
        requestId: envelope?.requestId || requestId,
        details: envelope?.details,
      })
    }

    return await response.blob()
  } catch (error) {
    throw toApiError(error, requestId)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 解析 SSE 响应体。
 *
 * 事件以空行分隔，`event:` 为事件名，`data:` 可多行。
 */
async function consumeSseBody(
  response: Response,
  onEvent: (event: ServerSentEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new ApiError('服务端未返回事件流', {
      code: -4,
      status: response.status,
      requestId: '',
    })
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let separator = buffer.indexOf('\n\n')
    while (separator >= 0) {
      const chunk = buffer.slice(0, separator)
      buffer = buffer.slice(separator + 2)

      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      if (dataLines.length > 0) {
        onEvent({ event: eventName, data: dataLines.join('\n') })
      }
      separator = buffer.indexOf('\n\n')
    }
  }
}

/**
 * SSE 订阅（带 Bearer 鉴权）。
 *
 * EventSource 无法附加 Authorization 头，因此用 fetch + ReadableStream 手动解析。
 * 函数在连接关闭或 signal 中止时返回，调用方可自行决定是否重连。
 */
async function requestSse(
  path: string,
  onEvent: (event: ServerSentEvent) => void,
  options: RequestOptions = {},
): Promise<void> {
  const requestId = genId('req')
  const token = getToken()
  const controller = new AbortController()
  const externalSignal = options.signal
  const abort = (): void => controller.abort()
  externalSignal?.addEventListener('abort', abort, { once: true })

  try {
    const response = await fetch(buildUrl(path), {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'X-Request-Id': requestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    })

    if (response.status === 401) {
      clearToken()
    }
    if (!response.ok || !response.body) {
      const envelope = (await response.json().catch(() => null)) as ApiEnvelope<null> | null
      throw new ApiError(envelope?.message || `HTTP ${response.status}`, {
        code: envelope?.code ?? -1,
        status: response.status,
        requestId: envelope?.requestId || requestId,
        details: envelope?.details,
      })
    }

    await consumeSseBody(response, onEvent)
  } catch (error) {
    if (controller.signal.aborted) return
    throw toApiError(error, requestId)
  } finally {
    externalSignal?.removeEventListener('abort', abort)
  }
}

/**
 * 带请求体的 SSE（POST）。用于 AI 流式对话。
 *
 * 不设置默认总超时；由调用方通过 AbortSignal 控制停止。
 */
async function requestPostSse(
  path: string,
  body: unknown,
  onEvent: (event: ServerSentEvent) => void,
  options: RequestOptions = {},
): Promise<void> {
  const requestId = genId('req')
  const token = getToken()
  const controller = new AbortController()
  const externalSignal = options.signal
  const abort = (): void => controller.abort()
  externalSignal?.addEventListener('abort', abort, { once: true })
  const timer = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined

  try {
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    })

    if (response.status === 401) {
      clearToken()
    }
    if (!response.ok || !response.body) {
      const envelope = (await response.json().catch(() => null)) as ApiEnvelope<null> | null
      throw new ApiError(envelope?.message || `HTTP ${response.status}`, {
        code: envelope?.code ?? -1,
        status: response.status,
        requestId: envelope?.requestId || requestId,
        details: envelope?.details,
      })
    }

    await consumeSseBody(response, onEvent)
  } catch (error) {
    if (controller.signal.aborted) {
      if (timer) {
        throw new ApiError('请求超时，请稍后重试', {
          code: -2,
          status: 0,
          requestId,
        })
      }
      return
    }
    throw toApiError(error, requestId)
  } finally {
    if (timer) clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abort)
  }
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  getBlob: (path: string, options?: RequestOptions) => requestBlob(path, options),
  sse: (path: string, onEvent: (event: ServerSentEvent) => void, options?: RequestOptions) =>
    requestSse(path, onEvent, options),
  postSse: (
    path: string,
    body: unknown,
    onEvent: (event: ServerSentEvent) => void,
    options?: RequestOptions,
  ) => requestPostSse(path, body, onEvent, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
}
