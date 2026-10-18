import { describe, expect, it } from 'vitest'
import { createTokenService } from '../token.js'

const context = {
  tenantId: '1',
  employeeId: '2',
  publicId: '01J00000000000000000000001',
}
const sessionId = 'session-01J00000000000000000000001'

describe('JWT token service', () => {
  it('签发后可验证出相同上下文与会话 ID', async () => {
    const tokens = createTokenService({ secret: 's'.repeat(32), ttlSeconds: 60 })
    const token = await tokens.issue(context, sessionId)

    await expect(tokens.verify(token)).resolves.toEqual({ ...context, sessionId })
  })

  it('篡改的令牌与错误密钥均被拒绝', async () => {
    const tokens = createTokenService({ secret: 's'.repeat(32), ttlSeconds: 60 })
    const other = createTokenService({ secret: 'o'.repeat(32), ttlSeconds: 60 })
    const token = await tokens.issue(context, sessionId)

    await expect(tokens.verify(`${token}tampered`)).rejects.toThrow()
    await expect(other.verify(token)).rejects.toThrow()
  })
})
