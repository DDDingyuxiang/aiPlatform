import type { Response } from 'express'
import { SUCCESS_CODE, type ApiEnvelope } from '@aiplatform/contracts'

/** 统一成功响应信封 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  requestId: string,
  status = 200,
): void {
  const body: ApiEnvelope<T> = {
    code: SUCCESS_CODE,
    data,
    message: 'ok',
    requestId,
  }
  res.status(status).json(body)
}

/** 统一失败响应信封 */
export function sendFailure(
  res: Response,
  code: number,
  message: string,
  requestId: string,
  status: number,
  details?: unknown,
): void {
  const body: ApiEnvelope<null> = {
    code,
    data: null,
    message,
    requestId,
    ...(details === undefined ? {} : { details }),
  }
  res.status(status).json(body)
}
