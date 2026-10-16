/**
 * 经营分析 store 测试：按范围加载与切换（d30 → 30 个趋势点；year → 12 个月度点）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, type Pinia } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { clearToken } from '@/core/auth/token'
import { useAnalyticsStore } from '@/modules/analytics'
import '@/core/auth/mock'
import '@/modules/analytics/mock'

let pinia: Pinia

async function loginAsAdmin(): Promise<void> {
  const auth = useAuthStore(pinia)
  const pending = auth.login({ username: 'admin', password: '123456', remember: false })
  await vi.advanceTimersByTimeAsync(500)
  await pending
}

describe('analytics store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearToken()
    pinia = createPinia()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('加载近 30 天数据（趋势 30 点、对比 6 桶、KPI 4 项）', async () => {
    await loginAsAdmin()
    const store = useAnalyticsStore(pinia)

    const pending = store.load('d30')
    await vi.advanceTimersByTimeAsync(600)
    await pending

    expect(store.overview?.range).toBe('d30')
    expect(store.overview?.trend).toHaveLength(30)
    expect(store.overview?.compare).toHaveLength(6)
    expect(store.overview?.kpis).toHaveLength(4)
    expect(store.overview?.departments).toHaveLength(5)
  })

  it('切换到年度范围（12 个月度趋势点）', async () => {
    await loginAsAdmin()
    const store = useAnalyticsStore(pinia)

    const first = store.load('d30')
    await vi.advanceTimersByTimeAsync(600)
    await first

    const second = store.load('year')
    await vi.advanceTimersByTimeAsync(600)
    await second

    expect(store.range).toBe('year')
    expect(store.overview?.trend).toHaveLength(12)
    expect(store.overview?.compare).toHaveLength(12)
  })
})
