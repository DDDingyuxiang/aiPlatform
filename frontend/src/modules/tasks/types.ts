/** 任务与里程碑类型（来源于共享契约） */
import type { TaskItem, TaskStatus } from '@aiplatform/contracts'

export type {
  CreateTaskPayload,
  Milestone,
  MilestoneStatus,
  TaskItem,
  TaskPerson,
  TaskPriority,
  TaskStatus,
  UpdateTaskPayload,
} from '@aiplatform/contracts'

/** 展示用状态：已完成优先，其次按截止时间推导逾期 */
export function displayStatus(
  task: TaskItem,
  now = Date.now(),
): TaskStatus | 'overdue' {
  if (task.status === 'done') return 'done'
  if (new Date(task.dueAt).getTime() < now) return 'overdue'
  return task.status
}
