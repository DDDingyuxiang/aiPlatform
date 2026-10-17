import { randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { AuthContext, TokenIssuer, TokenVerifier } from './types.js'

const TOKEN_ISSUER = 'aiplatform'
const TOKEN_AUDIENCE = 'aiplatform-web'
const TOKEN_ALGORITHM = 'HS256'

export interface TokenServiceOptions {
  /** 至少 32 字符，由配置层校验 */
  secret: string
  ttlSeconds: number
}

export interface TokenService extends TokenIssuer, TokenVerifier {}

/**
 * 无状态 JWT：登出由客户端清除令牌；如需服务端强制失效，
 * 后续可引入 Redis 黑名单（jti）而不改变接口。
 */
export function createTokenService(options: TokenServiceOptions): TokenService {
  const secret = new TextEncoder().encode(options.secret)

  return {
    async issue(auth) {
      return new SignJWT({ tid: auth.tenantId, eid: auth.employeeId })
        .setProtectedHeader({ alg: TOKEN_ALGORITHM, typ: 'JWT' })
        .setIssuer(TOKEN_ISSUER)
        .setAudience(TOKEN_AUDIENCE)
        .setSubject(auth.publicId)
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + options.ttlSeconds)
        .sign(secret)
    },

    async verify(token) {
      const { payload } = await jwtVerify(token, secret, {
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        algorithms: [TOKEN_ALGORITHM],
      })

      const { tid, eid, sub } = payload
      if (typeof tid !== 'string' || typeof eid !== 'string' || typeof sub !== 'string') {
        throw new Error('令牌载荷不完整')
      }

      return { tenantId: tid, employeeId: eid, publicId: sub }
    },
  }
}
