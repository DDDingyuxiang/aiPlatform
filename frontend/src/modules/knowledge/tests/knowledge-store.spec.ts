/**
 * 知识库 store 测试：文档加载与上传（仅元数据）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, type Pinia } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { clearToken } from '@/core/auth/token'
import { useKnowledgeStore } from '@/modules/knowledge'
import type { KnowledgeDoc } from '@/modules/knowledge'
import { knowledgeApi } from '../api'
import type { KnowledgeDocumentVersion } from '../types'
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
    vi.restoreAllMocks()
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

describe('knowledge status polling', () => {
  const pendingDoc: KnowledgeDoc = {
    id: 'k-poll',
    title: '异步索引文档',
    category: 'policy',
    fileType: 'txt',
    sizeBytes: 120,
    owner: { id: 'u-001', name: '王立' },
    department: '综合管理部',
    updatedAt: '2026-10-19T00:00:00.000Z',
    tags: [],
    summary: '',
    status: 'pending',
    fileName: 'poll.txt',
    versionCount: 1,
  }
  const readyDoc: KnowledgeDoc = {
    ...pendingDoc,
    status: 'ready',
    currentVersionNo: 1,
  }
  const pendingVersion: KnowledgeDocumentVersion = {
    versionNo: 1,
    status: 'pending',
    fileName: 'poll.txt',
    sizeBytes: 120,
    createdAt: '2026-10-19T00:00:00.000Z',
    isCurrent: false,
    jobStage: 'queued',
    jobProgress: 0,
  }
  const readyVersion: KnowledgeDocumentVersion = {
    ...pendingVersion,
    status: 'ready',
    isCurrent: true,
    jobStage: 'completed',
    jobProgress: 100,
  }

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearToken()
    pinia = createPinia()
    vi.useFakeTimers()
  })

  it('加载到 pending 文档后轮询状态并更新缓存', async () => {
    vi.spyOn(knowledgeApi, 'documents').mockResolvedValue([pendingDoc])
    const status = vi
      .spyOn(knowledgeApi, 'status')
      .mockResolvedValueOnce({
        document: pendingDoc,
        version: pendingVersion,
        job: null,
      })
      .mockResolvedValueOnce({
        document: readyDoc,
        version: readyVersion,
        job: null,
      })
    const store = useKnowledgeStore(pinia)

    await store.loadAll()
    await vi.advanceTimersByTimeAsync(0)
    expect(status).toHaveBeenCalledTimes(1)
    expect(store.docs[0]?.status).toBe('pending')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(status).toHaveBeenCalledTimes(2)
    expect(store.docs[0]?.status).toBe('ready')
    expect(store.docs[0]?.currentVersionNo).toBe(1)

    // 就绪后停止轮询
    await vi.advanceTimersByTimeAsync(10_000)
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('打开 pending 版本时按 versionNo 轮询并更新版本进度', async () => {
    vi.spyOn(knowledgeApi, 'documents').mockResolvedValue([readyDoc])
    vi.spyOn(knowledgeApi, 'versions').mockResolvedValue([
      pendingVersion,
      { ...readyVersion, versionNo: 0, isCurrent: false, status: 'ready' },
    ])
    const status = vi.spyOn(knowledgeApi, 'status').mockResolvedValue({
      document: readyDoc,
      version: { ...readyVersion, versionNo: 2 },
      job: null,
    })
    const store = useKnowledgeStore(pinia)

    await store.loadVersions('k-poll')
    await vi.advanceTimersByTimeAsync(0)

    expect(status).toHaveBeenCalledWith('k-poll', 1)
    expect(store.versionsById['k-poll']?.[0]).toMatchObject({
      versionNo: 2,
      status: 'ready',
      jobProgress: 100,
    })
  })
})
