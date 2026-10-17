/**
 * 认证 store 测试。
 * 回归场景一：Mock 令牌格式为 mock-token-<userId>-<时间戳>，userId 本身含「-」（如 u-001），
 * 令牌解析错误会导致刷新页面时被误判为登录失效。
 * 回归场景二：isAuthenticated 的短路依赖追踪陷阱（曾导致「登录后无法跳转」）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { clearToken, setToken } from '@/core/auth/token'
import '@/core/auth/mock'

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    // token 为模块级响应式状态，测试间必须复位（只清 storage 不够）
    clearToken()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('持有有效令牌时 refreshProfile 恢复登录态', async () => {
    setToken('mock-token-u-001-1730000000000', true)
    const auth = useAuthStore(createPinia())

    const pending = auth.refreshProfile()
    await vi.advanceTimersByTimeAsync(500)
    await pending

    expect(auth.user?.name).toBe('王立')
    expect(auth.isAuthenticated).toBe(true)
  })

  it('令牌无效时 refreshProfile 清除登录态', async () => {
    setToken('mock-token-u-999-1730000000000', true)
    const auth = useAuthStore(createPinia())

    const pending = auth.refreshProfile()
    await vi.advanceTimersByTimeAsync(500)
    await pending

    expect(auth.user).toBeNull()
    expect(localStorage.getItem('app.auth.token')).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('登录成功后令牌与用户信息可用', async () => {
    const auth = useAuthStore(createPinia())

    const pending = auth.login({ username: 'lisi', password: '123456', remember: true })
    await vi.advanceTimersByTimeAsync(500)
    await pending

    expect(auth.user?.name).toBe('李思')
    expect(localStorage.getItem('app.auth.token')).toContain('u-002')
    expect(auth.isAuthenticated).toBe(true)
  })

  it('登录前 isAuthenticated 为 false，登录后立即变为 true（依赖追踪回归）', async () => {
    const auth = useAuthStore(createPinia())
    // 首次评估（触发短路路径）
    expect(auth.isAuthenticated).toBe(false)

    const pending = auth.login({ username: 'admin', password: '123456', remember: false })
    await vi.advanceTimersByTimeAsync(500)
    await pending

    // 若 computed 未追踪 user 依赖，此处会因缓存返回 false
    expect(auth.isAuthenticated).toBe(true)
    expect(sessionStorage.getItem('app.auth.token')).toBeTruthy()
  })

  it('修改个人资料后同步内存状态与本地缓存', async () => {
    setToken('mock-token-u-002-1730000000000', true)
    const auth = useAuthStore(createPinia())

    const pending = auth.updateProfile({
      name: '李思思',
      position: '市场主管',
      email: 'lisi-new@example.com',
      phone: '',
    })
    await vi.advanceTimersByTimeAsync(500)
    await pending

    expect(auth.user?.name).toBe('李思思')
    expect(auth.user?.position).toBe('市场主管')
    expect(auth.user?.email).toBe('lisi-new@example.com')
    expect(auth.user?.phone).toBe('')
    expect(JSON.parse(localStorage.getItem('app.auth.user') ?? '{}').name).toBe('李思思')
  })
})
