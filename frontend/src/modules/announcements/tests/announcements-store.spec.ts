/**
 * 公告 store 测试：可见范围（公司/本部门/同事）、未读统计与已读操作。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, type Pinia } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { clearToken } from '@/core/auth/token'
import { useAnnouncementsStore } from '@/modules/announcements'
import '@/core/auth/mock'
import '@/modules/identity/mock'
import '@/modules/announcements/mock'

let pinia: Pinia

async function loginAs(username: string): Promise<void> {
  const auth = useAuthStore(pinia)
  const pending = auth.login({ username, password: '123456', remember: false })
  await vi.advanceTimersByTimeAsync(500)
  await pending
}

async function loadAnnouncements() {
  const store = useAnnouncementsStore(pinia)
  const pending = store.loadAll()
  await vi.advanceTimersByTimeAsync(500)
  await pending
  return store
}

describe('announcements store', () => {
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

  it('部门公告按当前用户所在部门过滤（综合管理部）', async () => {
    await loginAs('admin')
    const store = await loadAnnouncements()

    // 公司 3 + 综合管理部 2 + 同事 3；市场部团建（an-06）不可见
    expect(store.items).toHaveLength(8)
    expect(store.byScope('company')).toHaveLength(3)
    expect(store.byScope('department')).toHaveLength(2)
    expect(store.byScope('colleague')).toHaveLength(3)
    expect(store.items.some((item) => item.id === 'an-06')).toBe(false)
  })

  it('市场部用户可见本部门公告', async () => {
    await loginAs('lisi')
    const store = await loadAnnouncements()

    expect(store.byScope('department').some((item) => item.id === 'an-06')).toBe(true)
    expect(store.items.some((item) => item.id === 'an-04')).toBe(false)
  })

  it('置顶优先排序，标记已读与全部已读', async () => {
    await loginAs('admin')
    const store = await loadAnnouncements()

    expect(store.sortedItems[0]?.pinned).toBe(true)
    expect(store.unreadCount).toBe(4)

    const markRead = store.markRead('an-04')
    await vi.advanceTimersByTimeAsync(300)
    await markRead
    expect(store.unreadCount).toBe(3)

    const markAll = store.markAllRead()
    await vi.advanceTimersByTimeAsync(300)
    await markAll
    expect(store.unreadCount).toBe(0)
  })
})
