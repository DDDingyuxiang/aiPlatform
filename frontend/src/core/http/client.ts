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
import { ApiError, SUCCESS_CODE, type ApiEnvelope, type HttpMethod, type RequestOptions } from './types'

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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(buildUrl(path, options.params), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
      })
    }
    return envelope.data
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('请求超时，请稍后重试', { code: -2, status: 0, requestId })
    }
    throw new ApiError(error instanceof Error ? error.message : '网络异常', {
      code: -3,
      status: 0,
      requestId,
    })
  } finally {
    clearTimeout(timer)
  }
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
}
