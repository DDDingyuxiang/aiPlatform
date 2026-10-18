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
 * JWT 只负责签名与声明；登录状态由 Redis 会话校验（jti）。
 * 这样登出、停用或删除账号后，旧令牌可以立即失效。
 */
export function createTokenService(options: TokenServiceOptions): TokenService {
  const secret = new TextEncoder().encode(options.secret)

  return {
    async issue(auth, sessionId) {
      return new SignJWT({ tid: auth.tenantId, eid: auth.employeeId })
        .setProtectedHeader({ alg: TOKEN_ALGORITHM, typ: 'JWT' })
        .setIssuer(TOKEN_ISSUER)
        .setAudience(TOKEN_AUDIENCE)
        .setSubject(auth.publicId)
        .setJti(sessionId)
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

      const { tid, eid, sub, jti } = payload
      if (
        typeof tid !== 'string' ||
        typeof eid !== 'string' ||
        typeof sub !== 'string' ||
        typeof jti !== 'string'
      ) {
        throw new Error('令牌载荷不完整')
      }

      return { tenantId: tid, employeeId: eid, publicId: sub, sessionId: jti }
    },
  }
}
