/** 任务与里程碑类型（与后端 tasks 模块的契约保持一致） */

export type TaskStatus = 'todo' | 'inProgress' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'

export interface TaskPerson {
  id: string
  name: string
}

export interface TaskItem {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  /** ISO 8601 */
  dueAt: string
  assignee: TaskPerson
  creator: TaskPerson
  /** 0-100 */
  progress: number
  milestoneId?: string
  milestoneName?: string
}

export type MilestoneStatus = 'upcoming' | 'inProgress' | 'done' | 'overdue'

export interface Milestone {
  id: string
  name: string
  project: string
  owner: TaskPerson
  /** ISO 8601 */
  dueAt: string
  status: MilestoneStatus
  totalTasks: number
  doneTasks: number
}

export interface CreateTaskPayload {
  title: string
  description: string
  priority: TaskPriority
  dueAt: string
  assigneeId: string
  milestoneId?: string
}

export interface UpdateTaskPayload {
  status: TaskStatus
}

/** 展示用状态：已完成优先，其次按截止时间推导逾期 */
export function displayStatus(task: TaskItem, now = Date.now()): TaskStatus | 'overdue' {
  if (task.status === 'done') return 'done'
  if (new Date(task.dueAt).getTime() < now) return 'overdue'
  return task.status
}
