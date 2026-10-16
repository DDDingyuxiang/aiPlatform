/** 任务接口（经统一 HTTP 客户端，开发环境由 mock.ts 拦截） */
import { http } from '@/core/http'
import type { CreateTaskPayload, Milestone, TaskItem, UpdateTaskPayload } from './types'

export const tasksApi = {
  list: () => http.get<TaskItem[]>('/tasks'),
  milestones: () => http.get<Milestone[]>('/tasks/milestones'),
  create: (payload: CreateTaskPayload) => http.post<TaskItem>('/tasks', payload),
  update: (id: string, payload: UpdateTaskPayload) => http.patch<TaskItem>(`/tasks/${id}`, payload),
}
