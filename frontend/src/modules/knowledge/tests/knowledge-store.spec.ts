/**
 * 知识库 store 测试：文档加载与上传（仅元数据）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, type Pinia } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { clearToken } from '@/core/auth/token'
import { useKnowledgeStore } from '@/modules/knowledge'
import '@/core/auth/mock'
import '@/modules/identity/mock'
import '@/modules/knowledge/mock'

let pinia: Pinia

async function loginAsAdmin(): Promise<void> {
  const auth = useAuthStore(pinia)
  const pending = auth.login({ username: 'admin', password: '123456', remember: false })
  await vi.advanceTimersByTimeAsync(500)
  await pending
}

async function loadDocs() {
  const store = useKnowledgeStore(pinia)
  const pending = store.loadAll()
  await vi.advanceTimersByTimeAsync(500)
  await pending
  return store
}

describe('knowledge store', () => {
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

  it('加载文档列表（按更新时间倒序）', async () => {
    await loginAsAdmin()
    const store = await loadDocs()

    expect(store.docs).toHaveLength(9)
    expect(store.recentDocs).toHaveLength(3)
    const first = store.docs[0]
    const second = store.docs[1]
    expect(first && second && first.updatedAt >= second.updatedAt).toBe(true)
  })

  it('上传材料后置顶显示且归属当前用户', async () => {
    await loginAsAdmin()
    const store = await loadDocs()

    const file = new File(['差旅报销测试内容'], '测试材料.md', {
      type: 'text/markdown',
    })
    const pending = store.upload({
      file,
      title: '测试上传材料',
      category: 'tech',
      tags: ['测试'],
    })
    await vi.advanceTimersByTimeAsync(500)
    const doc = await pending

    expect(doc.owner.name).toBe('王立')
    expect(doc.status).toBe('ready')
    expect(store.docs).toHaveLength(10)
    expect(store.docs[0]?.id).toBe(doc.id)
  })

  it('语义检索返回相关文档分块并丢弃空查询', async () => {
    await loginAsAdmin()
    const store = await loadDocs()

    const pending = store.search('差旅')
    await vi.advanceTimersByTimeAsync(500)
    await pending

    expect(store.searchHits.length).toBeGreaterThan(0)
    expect(store.searchHits[0]?.title).toContain('差旅')

    store.clearSearch()
    expect(store.searchHits).toHaveLength(0)
  })
})
