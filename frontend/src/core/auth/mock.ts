/**
 * 认证接口的 Mock 实现（演示数据，后端 identity 模块就绪后整体删除）。
 * 路径与响应结构与真实接口约定一致；被 app/register-mocks.ts 按需动态导入，
 * 仅在 features.mockApi 开启时注册（模块导入即注册，见 core/http/mock.ts）。
 */
import { defineMock, fail } from '@/core/http'
import type { LoginPayload, LoginResult, UserProfile } from './types'

interface MockUser extends UserProfile {
  password: string
}

const MOCK_USERS: MockUser[] = [
  {
    id: 'u-001',
    username: 'admin',
    password: '123456',
    name: '王立',
    role: 'admin',
    employeeId: 'E1001',
    position: '数字化平台主管',
    department: '综合管理部',
    email: 'wangli@example.com',
    phone: '13800001001',
  },
  {
    id: 'u-002',
    username: 'lisi',
    password: '123456',
    name: '李思',
    role: 'employee',
    employeeId: 'E1024',
    position: '市场专员',
    department: '市场部',
    email: 'lisi@example.com',
    phone: '13800001024',
  },
]

function toProfile(user: MockUser): UserProfile {
  const { password: _password, ...profile } = user
  return profile
}

/**
 * 从令牌解析当前用户 ID。
 * 供其他模块的 Mock 复用（真实环境下为后端鉴权中间件的职责）；
 * 注意：用户 ID 本身含「-」（如 u-001），必须用前缀匹配而非 split。
 */
export function findMockUserId(token: string | null): string | null {
  if (!token || !token.startsWith('mock-token-')) return null
  return MOCK_USERS.find((user) => token.startsWith(`mock-token-${user.id}-`))?.id ?? null
}

defineMock('POST', '/auth/login', ({ body }) => {
  const payload = body as LoginPayload | undefined
  if (!payload?.username || !payload?.password) {
    return fail(40001, '用户名和密码不能为空', 400)
  }
  const user = MOCK_USERS.find((item) => item.username === payload.username)
  if (!user || user.password !== payload.password) {
    return fail(40101, '用户名或密码错误', 401)
  }
  const result: LoginResult = {
    token: `mock-token-${user.id}-${Date.now()}`,
    user: toProfile(user),
  }
  return result
})

defineMock('POST', '/auth/logout', () => ({ ok: true }), { delayMs: 150 })

defineMock('GET', '/auth/profile', ({ token }) => {
  const userId = findMockUserId(token)
  const user = MOCK_USERS.find((item) => item.id === userId)
  if (!user) return fail(40100, '登录状态已失效', 401)
  return toProfile(user)
})

defineMock('PATCH', '/auth/profile', ({ body, token }) => {
  const userId = findMockUserId(token)
  const user = MOCK_USERS.find((item) => item.id === userId)
  if (!user) return fail(40100, '登录状态已失效', 401)

  const payload = body as Partial<Pick<UserProfile, 'name' | 'position' | 'email' | 'phone'>> | undefined
  if (!payload || Object.keys(payload).length === 0) return fail(40000, '请求参数不合法', 400)

  if (payload.name !== undefined) {
    const name = payload.name.trim()
    if (!name) return fail(40000, '请求参数不合法', 400)
    user.name = name
  }
  if (payload.position !== undefined) user.position = payload.position?.trim() ?? ''
  if (payload.email !== undefined) user.email = payload.email.trim().toLowerCase()
  if (payload.phone !== undefined) user.phone = payload.phone?.trim() ?? ''

  return toProfile(user)
})
