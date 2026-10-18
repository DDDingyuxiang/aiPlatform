/**
 * 业务任务契约。
 *
 * - 前端任务中心、后端 tasks 模块与 AI 任务抽取共用；
 * - dueAt 在任务对象中是带时区的 ISO 8601；手工创建时使用 YYYY-MM-DD；
 * - AI 抽取结果必须经过本文件的 Schema 校验后才能落库。
 */
import { z } from 'zod'
import { apiIdSchema, isoDateSchema, isoDateTimeSchema } from './common.js'

export const taskStatusSchema = z.enum(['todo', 'inProgress', 'done'])
export type TaskStatus = z.infer<typeof taskStatusSchema>

export const taskPrioritySchema = z.enum(['high', 'medium', 'low'])
export type TaskPriority = z.infer<typeof taskPrioritySchema>

export const taskPersonSchema = z.object({
  id: apiIdSchema,
  name: z.string().min(1).max(128),
})
export type TaskPerson = z.infer<typeof taskPersonSchema>

export const taskItemSchema = z.object({
  id: apiIdSchema,
  title: z.string().min(1).max(255),
  description: z.string().max(5_000),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueAt: isoDateTimeSchema,
  assignee: taskPersonSchema,
  creator: taskPersonSchema,
  progress: z.number().int().min(0).max(100),
  milestoneId: apiIdSchema.optional(),
  milestoneName: z.string().max(255).optional(),
})
export type TaskItem = z.infer<typeof taskItemSchema>

/** 手工创建任务：截止日期使用 YYYY-MM-DD，由后端换算为业务时区 18:00 */
export const taskCreatePayloadSchema = z.strictObject({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5_000).optional(),
  priority: taskPrioritySchema.optional(),
  dueAt: isoDateSchema,
  assigneeId: apiIdSchema,
  milestoneId: apiIdSchema.optional(),
})
export type CreateTaskPayload = z.infer<typeof taskCreatePayloadSchema>

/**
 * 任务更新：状态由负责人流转；标题、描述、优先级、截止日期和负责人只能由分配者修改。
 * 所有字段可选，但至少提交一项，避免空请求。
 */
export const taskUpdatePayloadSchema = z
  .strictObject({
    status: taskStatusSchema.optional(),
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(5_000).optional(),
    priority: taskPrioritySchema.optional(),
    dueAt: isoDateSchema.optional(),
    assigneeId: apiIdSchema.optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: '至少提供一个要修改的字段',
  })
export type UpdateTaskPayload = z.infer<typeof taskUpdatePayloadSchema>

export const milestoneStatusSchema = z.enum(['upcoming', 'inProgress', 'done', 'overdue'])
export type MilestoneStatus = z.infer<typeof milestoneStatusSchema>

export const milestoneSchema = z.object({
  id: apiIdSchema,
  name: z.string().min(1).max(255),
  project: z.string().max(255),
  owner: taskPersonSchema,
  dueAt: isoDateTimeSchema,
  status: milestoneStatusSchema,
  totalTasks: z.number().int().nonnegative(),
  doneTasks: z.number().int().nonnegative(),
})
export type Milestone = z.infer<typeof milestoneSchema>

/**
 * AI 从对话中抽取的任务（内部契约，传给后端前必须校验）。
 *
 * create=false 表示对话中不存在需要创建的未来任务。
 */
export const extractedTaskSchema = z.object({
  create: z.boolean(),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5_000).optional(),
  dueAt: isoDateTimeSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: apiIdSchema.optional(),
})
export type ExtractedTask = z.infer<typeof extractedTaskSchema>
