import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserProfile } from '@aiplatform/contracts'
import { createApp } from '../../app.js'
import { createAuthMiddleware } from '../../modules/identity/auth-middleware.js'
import { createIdentityRouter } from '../../modules/identity/identity-router.js'
import { createAuthRouter } from '../../modules/identity/router.js'
import type {
  AuthContext,
  IdentityService,
  TokenVerifier,
} from '../../modules/identity/types.js'
import type { Logger } from '../../shared/logger.js'
import { ErrorCode } from '../errors.js'

const authContext: AuthContext = {
  tenantId: '1',
  employeeId: '2',
  publicId: '01J00000000000000000000001',
}

const user: UserProfile = {
  id: authContext.publicId,
  username: 'admin',
  name: '王立',
  role: 'admin',
  employeeId: 'E1001',
  position: '数字化平台主管',
  department: '综合管理部',
  email: 'admin@example.com',
  phone: '13800001001',
}

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

function createTestApp(options?: { healthy?: boolean }) {
  let healthy = options?.healthy ?? true

  const service: IdentityService = {
    login: vi.fn(async () => ({ token: 'signed-token', user })),
    profile: vi.fn(async () => user),
    logout: vi.fn(async () => ({ ok: true })),
    directory: vi.fn(async () => ({
      departments: [{ id: '10', name: '综合管理部' }],
      members: [],
    })),
    attendance: vi.fn(async () => ({
      month: '2026-10',
      days: [{ date: '2026-10-01', status: 'normal' as const }],
    })),
    updateProfile: vi.fn(async (_auth, payload) => ({
      ...user,
      name: payload.name ?? user.name,
    })),
  }
  const tokens: TokenVerifier = {
    verify: vi.fn(async (token: string) => {
      if (token !== 'valid-token') throw new Error('invalid token')
      return authContext
    }),
  }
  const requireAuth = createAuthMiddleware(tokens)
  const authRouter = createAuthRouter({ service, requireAuth })
  const identityRouter = createIdentityRouter({ service, requireAuth })

  const app = createApp({
    authRouter,
    identityRouter,
    healthCheck: async () => {
      if (!healthy) throw new Error('database down')
    },
    corsOrigins: ['http://localhost:5173'],
    logger: silentLogger,
  })

  return {
    app,
    service,
    tokens,
    setHealthy: (value: boolean) => {
      healthy = value
    },
  }
}

describe('API envelope and request id', () => {
  it('健康检查返回统一信封并回显请求 ID', async () => {
    const { app } = createTestApp()

    const response = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'test-request-1')

    expect(response.status).toBe(200)
    expect(response.headers['x-request-id']).toBe('test-request-1')
    expect(response.body).toEqual({
      code: 0,
      data: { status: 'ok' },
      message: 'ok',
      requestId: 'test-request-1',
    })
  })

  it('依赖不可用时健康检查返回 50300', async () => {
    const { app, setHealthy } = createTestApp()
    setHealthy(false)

    const response = await request(app).get('/api/v1/health')

    expect(response.status).toBe(503)
    expect(response.body).toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE, data: null })
  })

  it('未知接口返回 40400，非法 JSON 返回 40000', async () => {
    const { app } = createTestApp()

    const notFound = await request(app).get('/api/v1/unknown')
    expect(notFound.status).toBe(404)
    expect(notFound.body).toMatchObject({ code: ErrorCode.NOT_FOUND, data: null })

    const invalidJson = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username":')
    expect(invalidJson.status).toBe(400)
    expect(invalidJson.body).toMatchObject({ code: ErrorCode.INVALID_PAYLOAD })
  })
})

describe('auth routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('登录接口接受契约校验并补齐 remember 默认值', async () => {
    const { app, service } = createTestApp()

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: '123456' })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({ token: 'signed-token', user })
    expect(service.login).toHaveBeenCalledWith({
      username: 'admin',
      password: '123456',
      remember: false,
    })
  })

  it('登录参数缺失时返回 40000', async () => {
    const { app } = createTestApp()

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ code: ErrorCode.INVALID_PAYLOAD })
  })

  it('受保护接口缺少或持有无效令牌时返回 40100', async () => {
    const { app } = createTestApp()

    const missing = await request(app).get('/api/v1/auth/profile')
    expect(missing.status).toBe(401)
    expect(missing.body).toMatchObject({ code: ErrorCode.UNAUTHORIZED })

    const invalid = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', 'Bearer invalid-token')
    expect(invalid.status).toBe(401)
    expect(invalid.body).toMatchObject({ code: ErrorCode.UNAUTHORIZED })
  })

  it('有效令牌可读取资料并登出', async () => {
    const { app } = createTestApp()

    const profile = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', 'Bearer valid-token')
    expect(profile.status).toBe(200)
    expect(profile.body.data).toMatchObject({ id: authContext.publicId, role: 'admin' })

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer valid-token')
    expect(logout.status).toBe(200)
    expect(logout.body.data).toEqual({ ok: true })
  })

  it('个人资料修改需要登录并校验载荷', async () => {
    const { app, service } = createTestApp()

    const unauthenticated = await request(app)
      .patch('/api/v1/auth/profile')
      .send({ name: '王立' })
    expect(unauthenticated.status).toBe(401)

    const invalidEmail = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ email: 'not-an-email' })
    expect(invalidEmail.status).toBe(400)
    expect(invalidEmail.body).toMatchObject({ code: ErrorCode.INVALID_PAYLOAD })

    const updated = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: ' 王立（新） ', phone: '' })
    expect(updated.status).toBe(200)
    expect(updated.body.data.name).toBe('王立（新）')
    expect(service.updateProfile).toHaveBeenCalledWith(authContext, {
      name: '王立（新）',
      phone: '',
    })
  })

  it('通讯录与考勤需要登录并返回契约结构', async () => {
    const { app } = createTestApp()

    const unauthenticated = await request(app).get('/api/v1/identity/directory')
    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.body).toMatchObject({ code: ErrorCode.UNAUTHORIZED })

    const directory = await request(app)
      .get('/api/v1/identity/directory')
      .set('Authorization', 'Bearer valid-token')
    expect(directory.status).toBe(200)
    expect(directory.body.data).toEqual({
      departments: [{ id: '10', name: '综合管理部' }],
      members: [],
    })

    const attendance = await request(app)
      .get('/api/v1/identity/attendance')
      .set('Authorization', 'Bearer valid-token')
    expect(attendance.status).toBe(200)
    expect(attendance.body.data.month).toBe('2026-10')
    expect(attendance.body.data.days).toEqual([{ date: '2026-10-01', status: 'normal' }])
  })

  it('允许配置的前端来源跨域访问', async () => {
    const { app } = createTestApp()

    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173')

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })
})
