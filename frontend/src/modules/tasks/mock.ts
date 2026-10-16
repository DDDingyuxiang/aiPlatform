/**
 * 任务接口的 Mock 实现（演示数据，后端 tasks 模块就绪后整体删除）。
 * 仅返回「与我相关」的任务（我负责的 + 我创建的）；里程碑为模块级可变状态。
 */
import { defineMock, fail } from '@/core/http'
import { findMockUserId } from '@/core/auth/mock'
import { MEMBERS } from '@/modules/identity/data'
import { DEMO_MILESTONES, DEMO_TASKS } from './data'
import type { CreateTaskPayload, TaskItem, TaskPerson, UpdateTaskPayload } from './types'

const milestones = DEMO_MILESTONES.map((item) => ({ ...item }))
const tasks: TaskItem[] = DEMO_TASKS.map((item) => ({ ...item }))

function personOf(id: string): TaskPerson {
  const member = MEMBERS.find((item) => item.id === id)
  return { id, name: member?.name ?? id }
}

defineMock(
  'GET',
  '/tasks',
  ({ token }) => {
    const userId = findMockUserId(token)
    if (!userId) return fail(40100, '登录状态已失效', 401)
    return tasks
      .filter((task) => task.assignee.id === userId || task.creator.id === userId)
      .map((task) => ({ ...task }))
  },
  { delayMs: 250 },
)

defineMock(
  'GET',
  '/tasks/milestones',
  ({ token }) => {
    if (!findMockUserId(token)) return fail(40100, '登录状态已失效', 401)
    return milestones.map((item) => ({ ...item }))
  },
  { delayMs: 250 },
)

defineMock('POST', '/tasks', ({ body, token }) => {
  const userId = findMockUserId(token)
  if (!userId) return fail(40100, '登录状态已失效', 401)
  const payload = body as CreateTaskPayload | undefined
  const title = payload?.title?.trim()
  if (!title) return fail(40010, '任务标题不能为空', 400)
  if (!payload?.assigneeId) return fail(40011, '请选择负责人', 400)
  if (!payload?.dueAt) return fail(40012, '请选择截止日期', 400)

  const milestone = payload.milestoneId
    ? milestones.find((item) => item.id === payload.milestoneId)
    : undefined
  const task: TaskItem = {
    id: `t-${Date.now()}`,
    title,
    description: payload.description?.trim() ?? '',
    status: 'todo',
    priority: payload.priority ?? 'medium',
    dueAt: new Date(`${payload.dueAt}T18:00:00`).toISOString(),
    assignee: personOf(payload.assigneeId),
    creator: personOf(userId),
    progress: 0,
    milestoneId: milestone?.id,
    milestoneName: milestone?.name,
  }
  tasks.push(task)
  return { ...task }
})

defineMock('PATCH', '/tasks/:id', ({ params, body, token }) => {
  if (!findMockUserId(token)) return fail(40100, '登录状态已失效', 401)
  const task = tasks.find((item) => item.id === params.id)
  if (!task) return fail(40410, '任务不存在', 404)
  const payload = body as UpdateTaskPayload | undefined
  if (!payload?.status) return fail(40013, '缺少状态参数', 400)
  task.status = payload.status
  if (payload.status === 'done') task.progress = 100
  else if (task.progress === 100) task.progress = 0
  return { ...task }
})
