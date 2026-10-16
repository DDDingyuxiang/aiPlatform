/**
 * 审批 store 测试：视角划分、状态流转（通过流转下一节点 / 驳回结束）、对话构建创建。
 * 注意：Mock 层数据为模块级状态，本文件用例按顺序共享（前序用例会改变单据状态）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, type Pinia } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { clearToken } from '@/core/auth/token'
import { useWorkflowsStore } from '@/modules/workflows'
import '@/core/auth/mock'
import '@/modules/identity/mock'
import '@/modules/workflows/mock'

let pinia: Pinia

async function loginAsAdmin(): Promise<void> {
  const auth = useAuthStore(pinia)
  const pending = auth.login({ username: 'admin', password: '123456', remember: false })
  await vi.advanceTimersByTimeAsync(500)
  await pending
}

async function flush(ms = 500): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

async function loadApprovals() {
  const store = useWorkflowsStore(pinia)
  const pending = store.loadAll()
  await flush()
  await pending
  return store
}

describe('workflows store', () => {
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

  it('按视角划分：待我审批 / 我发起的 / 已处理', async () => {
    await loginAsAdmin()
    const store = await loadApprovals()

    expect(store.pendingApprovals).toHaveLength(4)
    expect(store.myApprovals).toHaveLength(2)
    expect(store.processedApprovals).toHaveLength(2)
    expect(store.pendingCount).toBe(4)
  })

  it('通过后流转到下一节点，待办数量减少', async () => {
    await loginAsAdmin()
    const store = await loadApprovals()

    const pending = store.decide('ap-01', { action: 'approve', comment: '' })
    await flush()
    await pending

    const item = store.byId('ap-01')
    expect(item?.status).toBe('pending')
    expect(item?.currentApproverId).toBe('u-030')
    expect(item?.steps[1]?.status).toBe('done')
    expect(item?.steps[2]?.status).toBe('active')
    expect(store.pendingCount).toBe(3)
  })

  it('驳回必须填写意见；驳回后整单结束', async () => {
    await loginAsAdmin()
    const store = await loadApprovals()

    // 先挂载 rejects 断言，避免拒绝在断言前触发「未处理拒绝」
    const invalid = expect(
      store.decide('ap-02', { action: 'reject', comment: '   ' }),
    ).rejects.toThrow()
    await flush()
    await invalid

    const rejected = store.decide('ap-02', { action: 'reject', comment: '请先确认工作交接安排' })
    await flush()
    await rejected

    const item = store.byId('ap-02')
    expect(item?.status).toBe('rejected')
    expect(item?.currentApproverId).toBeUndefined()
  })

  it('对话构建的载荷创建后出现在「我发起的」并进入下一审批节点', async () => {
    await loginAsAdmin()
    const store = await loadApprovals()

    const pending = store.create({
      type: 'leave',
      title: '测试请假申请',
      fields: [{ key: 'days', label: '天数', value: '2 天' }],
    })
    await flush()
    const item = await pending

    expect(item.applicant.id).toBe('u-001')
    expect(item.currentApproverId).toBe('u-004')
    expect(item.steps).toHaveLength(2)
    expect(store.myApprovals.some((approval) => approval.id === item.id)).toBe(true)
  })
})
