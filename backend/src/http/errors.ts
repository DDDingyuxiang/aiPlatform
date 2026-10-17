/** 稳定业务错误码（与前端 mock 中的错误码约定保持一致） */
export const ErrorCode = {
  INVALID_PAYLOAD: 40000,
  UNAUTHORIZED: 40100,
  INVALID_CREDENTIALS: 40101,
  NOT_FOUND: 40400,
  EMAIL_CONFLICT: 40901,
  INTERNAL: 50000,
  SERVICE_UNAVAILABLE: 50300,
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]

/** 可预期的业务错误；未知异常统一由错误处理中间件降级为 50000 */
export class AppError extends Error {
  readonly code: number
  readonly status: number
  readonly details?: unknown

  constructor(
    code: number,
    message: string,
    status = 500,
    options?: { cause?: unknown; details?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = options?.details
  }
}
