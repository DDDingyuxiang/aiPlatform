/**
 * 任务 store 测试：视角划分（我负责的/我分配的）、状态流转、创建任务。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, type Pinia } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { clearToken } from '@/core/auth/token'
import { useTasksStore } from '@/modules/tasks'
import '@/core/auth/mock'
import '@/modules/identity/mock'
import '@/modules/tasks/mock'

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

async function loadTasks() {
  const tasks = useTasksStore(pinia)
  const pending = tasks.loadAll()
  await flush()
  await pending
  return tasks
}

describe('tasks store', () => {
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

  it('按视角划分：我负责的、我分配的与待办', async () => {
    await loginAsAdmin()
    const tasks = await loadTasks()

    expect(tasks.mineTasks).toHaveLength(6)
    expect(tasks.assignedTasks).toHaveLength(4)
    // 我负责的未完成事项（t-05 已完成不计入）
    expect(tasks.myPendingTasks).toHaveLength(5)
    expect(tasks.milestones).toHaveLength(4)
  })

  it('标记完成时进度同步为 100', async () => {
    await loginAsAdmin()
    const tasks = await loadTasks()

    const pending = tasks.setStatus('t-03', 'done')
    await flush()
    await pending

    const task = tasks.taskById('t-03')
    expect(task?.status).toBe('done')
    expect(task?.progress).toBe(100)
    expect(tasks.myPendingTasks).toHaveLength(4)
  })

  it('创建任务后出现在「我分配的」列表', async () => {
    await loginAsAdmin()
    const tasks = await loadTasks()

    const pending = tasks.create({
      title: '验证报销单原型交互',
      description: '',
      priority: 'low',
      dueAt: '2099-01-01',
      assigneeId: 'u-012',
    })
    await flush()
    const created = await pending

    expect(created.assignee.name).toBe('吴科')
    expect(created.creator.id).toBe('u-001')
    expect(tasks.assignedTasks.some((task) => task.id === created.id)).toBe(true)
  })
})
