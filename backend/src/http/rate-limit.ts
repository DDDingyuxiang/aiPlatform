import { createHash } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import type { RedisClient } from '../infra/redis.js'
import { AppError, ErrorCode } from './errors.js'

export interface RedisRateLimitOptions {
  namespace: string
  limit: number
  windowMs: number
  key: (request: Request) => string
}

const INCREMENT_AND_EXPIRE = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('PTTL', KEYS[1]) }
`

/** Redis errors fail closed so an outage cannot silently disable request limits. */
export function createRedisRateLimit(
  redis: RedisClient,
  options: RedisRateLimitOptions,
): RequestHandler {
  return async (request, response, next) => {
    const digest = createHash('sha256').update(options.key(request)).digest('hex')
    let result: [number, number]
    try {
      const value = await redis.eval(
        INCREMENT_AND_EXPIRE,
        1,
        `rate-limit:${options.namespace}:${digest}`,
        String(options.windowMs),
      )
      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error('Unexpected Redis rate-limit response')
      }
      result = [Number(value[0]), Number(value[1])]
    } catch (error) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '请求保护服务暂不可用', 503, {
        cause: error,
      })
    }

    const [count, remainingMs] = result
    response.setHeader('RateLimit-Limit', String(options.limit))
    response.setHeader('RateLimit-Remaining', String(Math.max(0, options.limit - count)))
    response.setHeader(
      'RateLimit-Reset',
      String(Math.ceil((Date.now() + Math.max(0, remainingMs)) / 1000)),
    )
    if (count > options.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
      response.setHeader('Retry-After', String(retryAfterSeconds))
      throw new AppError(ErrorCode.RATE_LIMITED, '请求过于频繁，请稍后再试', 429)
    }
    next()
  }
}

export function requestIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown'
}

export function loginIdentityKey(request: Request): string {
  const username =
    typeof request.body?.username === 'string'
      ? request.body.username.trim().toLocaleLowerCase('en-US')
      : ''
  return `${requestIp(request)}:${username}`
}

export function authIdentityKey(request: Request): string {
  const auth = request.auth
  return auth ? `${auth.tenantId}:${auth.employeeId}` : requestIp(request)
}
