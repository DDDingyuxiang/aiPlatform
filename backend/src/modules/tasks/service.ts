import { ulid } from 'ulid'
import type {
  CreateTaskPayload,
  Milestone,
  TaskItem,
  TaskPriority,
  TaskStatus,
  UpdateTaskPayload,
} from '@aiplatform/contracts'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { Logger } from '../../shared/logger.js'
import { zonedDateTimeToUtc } from '../../shared/time-zone.js'
import type { AuthContext } from '../identity/index.js'
import {
  DuplicateTaskSourceError,
  type AiTaskAnalyzer,
  type ChatTaskAnalysisInput,
  type ChatTaskResult,
  type TaskCreateRecord,
  type TaskRecord,
  type TasksRepository,
  type TaskUpdateRecord,
  type TasksService,
} from './types.js'

export interface TasksServiceOptions {
  repository: TasksRepository
  analyzer: AiTaskAnalyzer
  /** 业务时区：手工任务的截止日期按该时区 18:00 计算 */
  timezone: string
  logger?: Logger
  now?: () => Date
}

function toTaskItem(record: TaskRecord): TaskItem {
  const status: TaskStatus =
    record.status === 'done'
      ? 'done'
      : record.status === 'in_progress'
        ? 'inProgress'
        : 'todo'
  return {
    id: record.publicId,
    title: record.title,
    description: record.description,
    status,
    priority: record.priority,
    dueAt: record.dueAt,
    assignee: { id: record.assignee.publicId, name: record.assignee.name },
    creator: { id: record.creator.publicId, name: record.creator.name },
    progress: record.progress,
  }
}

function toDatabaseStatus(status: TaskStatus): 'todo' | 'in_progress' | 'done' {
  return status === 'done' ? 'done' : status === 'inProgress' ? 'in_progress' : 'todo'
}

export function createTasksService(options: TasksServiceOptions): TasksService {
  const { repository, analyzer, timezone, logger } = options
  const now = options.now ?? (() => new Date())

  function notFound(message = '任务不存在'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, 404)
  }

  function invalid(message: string): AppError {
    return new AppError(ErrorCode.INVALID_PAYLOAD, message, 400)
  }

  async function loadTask(
    tenantId: string,
    publicId: string,
    employeeId: string,
  ): Promise<TaskRecord> {
    const task = await repository.findForEmployee(tenantId, publicId, employeeId)
    if (!task) throw notFound()
    return task
  }

  async function analyzeChatMessage(
    input: ChatTaskAnalysisInput,
  ): Promise<ChatTaskResult | null> {
    const extracted = await analyzer.extract({
      now: now().toISOString(),
      timezone: input.timezone,
      participants: input.conversation.participants.map((participant) => ({
        id: participant.publicId,
        name: participant.name,
      })),
      messages: input.recentMessages.map((message) => ({
        senderId: message.senderId,
        senderName: message.senderName,
        content: message.content,
        sentAt: message.sentAt,
      })),
    })

    if (!extracted || !extracted.create) return null
    if (!extracted.title || !extracted.dueAt) {
      logger?.info('tasks.ai_extract_ignored', { reason: 'missing_required_fields' })
      return null
    }

    const dueAt = new Date(extracted.dueAt)
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= now().getTime()) {
      logger?.info('tasks.ai_extract_ignored', { reason: 'due_at_not_future' })
      return null
    }

    const assignee =
      input.conversation.participants.find(
        (participant) => participant.publicId === extracted.assigneeId,
      ) ??
      input.conversation.participants.find(
        (participant) => participant.publicId === input.message.senderPublicId,
      )
    if (!assignee) {
      logger?.info('tasks.ai_extract_ignored', { reason: 'assignee_not_found' })
      return null
    }

    // 同一条消息只创建一次任务（数据库唯一键兜底并发）
    const existing = await repository.findBySourceMessage(
      input.auth.tenantId,
      'chat',
      input.message.id,
    )
    if (existing) return null

    const publicId = ulid()
    const record: TaskCreateRecord = {
      publicId,
      title: extracted.title,
      description: (extracted.description ?? '').slice(0, 5_000),
      priority: (extracted.priority ?? 'medium') as TaskPriority,
      dueAt,
      assigneeEmployeeId: assignee.employeeId,
      creatorEmployeeId: input.auth.employeeId,
      sourceType: 'chat',
      sourceConversationId: input.conversation.conversationId,
      sourceMessageId: input.message.id,
    }

    try {
      await repository.create(input.auth.tenantId, record)
    } catch (error) {
      if (error instanceof DuplicateTaskSourceError) return null
      throw error
    }

    const created =
      (await repository.findBySourceMessage(
        input.auth.tenantId,
        'chat',
        input.message.id,
      )) ??
      (await repository.findForEmployee(
        input.auth.tenantId,
        publicId,
        input.auth.employeeId,
      ))
    if (!created) {
      throw new AppError(ErrorCode.INTERNAL, '创建任务后读取失败', 500)
    }

    logger?.info('tasks.ai_created', {
      tenantId: input.auth.tenantId,
      conversationId: input.conversation.publicId,
      assigneeEmployeeId: assignee.employeeId,
    })

    return {
      task: toTaskItem(created),
      assigneeEmployeeId: assignee.employeeId,
      creatorEmployeeId: input.auth.employeeId,
      assigneeName: assignee.name,
    }
  }

  return {
    async list(auth) {
      const tasks = await repository.listForEmployee(auth.tenantId, auth.employeeId)
      return tasks.map(toTaskItem)
    },

    async milestones(_auth): Promise<Milestone[]> {
      // 首期暂未实现里程碑持久化；任务中心会展示空状态
      return []
    },

    async create(auth, payload: CreateTaskPayload) {
      const employees = await repository.findEmployeesByPublicIds(auth.tenantId, [
        payload.assigneeId,
      ])
      const assignee = employees.find(
        (employee) => employee.publicId === payload.assigneeId,
      )
      if (!assignee || assignee.status !== 'active') {
        throw invalid('负责人不存在或已停用')
      }

      const publicId = ulid()
      await repository.create(auth.tenantId, {
        publicId,
        title: payload.title,
        description: payload.description ?? '',
        priority: payload.priority ?? 'medium',
        dueAt: zonedDateTimeToUtc(payload.dueAt, 18, timezone),
        assigneeEmployeeId: assignee.employeeId,
        creatorEmployeeId: auth.employeeId,
      })

      return toTaskItem(await loadTask(auth.tenantId, publicId, auth.employeeId))
    },

    async update(auth, publicId, payload: UpdateTaskPayload) {
      const task = await loadTask(auth.tenantId, publicId, auth.employeeId)

      // 任务内容（标题/描述/截止时间/负责人等）只有分配者可以调整；
      // 负责人仍可单独流转自己任务的状态。
      const editsDetails =
        payload.title !== undefined ||
        payload.description !== undefined ||
        payload.priority !== undefined ||
        payload.dueAt !== undefined ||
        payload.assigneeId !== undefined
      if (editsDetails && task.creator.employeeId !== auth.employeeId) {
        throw new AppError(ErrorCode.FORBIDDEN, '只有任务分配者可以修改任务', 403)
      }

      const record: TaskUpdateRecord = {}
      if (payload.title !== undefined) record.title = payload.title
      if (payload.description !== undefined) record.description = payload.description
      if (payload.priority !== undefined) record.priority = payload.priority
      if (payload.dueAt !== undefined) {
        record.dueAt = zonedDateTimeToUtc(payload.dueAt, 18, timezone)
      }
      if (payload.status !== undefined) {
        record.status = toDatabaseStatus(payload.status)
      }

      if (payload.assigneeId && payload.assigneeId !== task.assignee.publicId) {
        const employees = await repository.findEmployeesByPublicIds(auth.tenantId, [
          payload.assigneeId,
        ])
        const assignee = employees.find(
          (employee) => employee.publicId === payload.assigneeId,
        )
        if (!assignee || assignee.status !== 'active') {
          throw invalid('负责人不存在或已停用')
        }
        record.assigneeEmployeeId = assignee.employeeId
      }

      await repository.update(auth.tenantId, task.taskId, record)
      return toTaskItem(await loadTask(auth.tenantId, publicId, auth.employeeId))
    },

    analyzeChatMessage,
  }
}
