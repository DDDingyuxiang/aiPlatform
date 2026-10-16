/** HTTP 层公共类型与统一约定 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** 后端统一响应信封（与后端 API 约定保持一致） */
export interface ApiEnvelope<T> {
  /** 0 表示成功；非 0 为稳定业务错误码 */
  code: number
  data: T
  message: string
  requestId: string
}

export const SUCCESS_CODE = 0

/** 请求选项 */
export interface RequestOptions {
  /** URL query 参数，undefined / null 会被忽略 */
  params?: Record<string, string | number | boolean | undefined | null>
  headers?: Record<string, string>
  /** 超时毫秒数，默认 15000 */
  timeoutMs?: number
  signal?: AbortSignal
}

/** 统一错误对象：调用方依据 code 决定展示文案（错误文案应走 i18n 映射） */
export class ApiError extends Error {
  readonly code: number
  /** HTTP 状态码，网络层错误时为 0 */
  readonly status: number
  readonly requestId: string

  constructor(message: string, info: { code: number; status: number; requestId: string }) {
    super(message)
    this.name = 'ApiError'
    this.code = info.code
    this.status = info.status
    this.requestId = info.requestId
  }
}
