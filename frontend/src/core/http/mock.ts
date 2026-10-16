/**
 * Mock 数据层：以后端 API 的「同形态」拦截器方式注册演示数据。
 *
 * - 仅当运行时配置 features.mockApi 开启时生效（见 client.ts）；
 * - 各业务模块在自己的 mock.ts 中注册端点，与真实接口路径、响应结构完全一致；
 * - 后端就绪后将 mockApi 置为 false 即可无感切换，业务代码零改动。
 *
 * 注意：本文件只提供注册/匹配机制，不包含任何业务数据。
 */
import type { HttpMethod } from './types'

export interface MockContext {
  body: unknown
  /** query 参数（值已转为字符串） */
  query: Record<string, string>
  /** 路径参数，如 /tasks/:id 中的 id */
  params: Record<string, string>
  /** 当前登录令牌（模拟后端鉴权上下文） */
  token: string | null
  requestId: string
}

/** 业务失败（对应真实后端 code !== 0 的响应） */
export interface MockFailure {
  __mockFailure: true
  code: number
  message: string
  status: number
}

export function fail(code: number, message: string, status = 400): MockFailure {
  return { __mockFailure: true, code, message, status }
}

export function isMockFailure(value: unknown): value is MockFailure {
  return typeof value === 'object' && value !== null && (value as MockFailure).__mockFailure === true
}

export type MockHandler<T = unknown> = (ctx: MockContext) => T | MockFailure | Promise<T | MockFailure>

interface MockRoute {
  method: HttpMethod
  path: string
  handler: MockHandler
  delayMs: number
  keys: string[]
  pattern: RegExp
}

const registry: MockRoute[] = []

export function defineMock(
  method: HttpMethod,
  path: string,
  handler: MockHandler,
  options: { delayMs?: number } = {},
): void {
  const keys: string[] = []
  const pattern = new RegExp(
    '^' +
      path.replace(/:[^/]+/g, (segment) => {
        keys.push(segment.slice(1))
        return '([^/]+)'
      }) +
      '$',
  )
  registry.push({ method, path, handler, delayMs: options.delayMs ?? 300, keys, pattern })
}

export function matchMock(
  method: HttpMethod,
  path: string,
): { route: MockRoute; params: Record<string, string> } | undefined {
  for (const route of registry) {
    if (route.method !== method) continue
    const match = route.pattern.exec(path)
    if (match) {
      const params: Record<string, string> = {}
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1] ?? '')
      })
      return { route, params }
    }
  }
  return undefined
}
