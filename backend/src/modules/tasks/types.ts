import type {
  CreateTaskPayload,
  ExtractedTask,
  Milestone,
  TaskItem,
  TaskPriority,
  TaskStatus,
  UpdateTaskPayload,
} from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'

export interface TaskEmployeeRef {
  employeeId: string
  publicId: string
  name: string
  status: string
}

export interface TaskPersonRecord {
  employeeId: string
  publicId: string
  name: string
}

export interface TaskRecord {
  taskId: string
  publicId: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'done'
  priority: TaskPriority
  dueAt: string
  progress: number
  assignee: TaskPersonRecord
  creator: TaskPersonRecord
}

export interface TaskCreateRecord {
  publicId: string
  title: string
  description: string
  priority: TaskPriority
  dueAt: Date
  assigneeEmployeeId: string
  creatorEmployeeId: string
  sourceType?: 'chat'
  sourceConversationId?: string
  sourceMessageId?: string
}

/** 来源消息已创建过任务：用于 AI 抽取幂等 */
export class DuplicateTaskSourceError extends Error {
  constructor() {
    super('该消息已创建过任务')
    this.name = 'DuplicateTaskSourceError'
  }
}

export interface TasksRepository {
  listForEmployee(tenantId: string, employeeId: string): Promise<TaskRecord[]>
  findForEmployee(
    tenantId: string,
    publicId: string,
    employeeId: string,
  ): Promise<TaskRecord | null>
  findBySourceMessage(
    tenantId: string,
    sourceType: string,
    sourceMessageId: string,
  ): Promise<TaskRecord | null>
  create(tenantId: string, record: TaskCreateRecord): Promise<void>
  updateStatus(
    tenantId: string,
    taskId: string,
    status: 'todo' | 'in_progress' | 'done',
  ): Promise<void>
  findEmployeesByPublicIds(
    tenantId: string,
    publicIds: string[],
  ): Promise<TaskEmployeeRef[]>
}

export interface ChatTaskParticipant {
  employeeId: string
  publicId: string
  name: string
}

export interface ChatTaskMessage {
  id: string
  senderPublicId: string
  content: string
  sentAt: string
}

export interface ChatTaskAnalysisInput {
  auth: AuthContext
  conversation: {
    conversationId: string
    publicId: string
    type: 'direct' | 'group'
    title: string | null
    participants: ChatTaskParticipant[]
  }
  message: ChatTaskMessage
  recentMessages: Array<{
    senderId: string
    senderName: string
    content: string
    sentAt: string
  }>
  timezone: string
}

export interface ChatTaskResult {
  task: TaskItem
  assigneeEmployeeId: string
  creatorEmployeeId: string
  assigneeName: string
}

/** 对话侧只依赖这个最小接口，避免与 tasks 模块内部实现耦合 */
export interface ChatTaskExtractor {
  analyzeChatMessage(input: ChatTaskAnalysisInput): Promise<ChatTaskResult | null>
}

export interface TasksService extends ChatTaskExtractor {
  list(auth: AuthContext): Promise<TaskItem[]>
  milestones(auth: AuthContext): Promise<Milestone[]>
  create(auth: AuthContext, payload: CreateTaskPayload): Promise<TaskItem>
  updateStatus(
    auth: AuthContext,
    publicId: string,
    payload: UpdateTaskPayload,
  ): Promise<TaskItem>
}

/** AI 服务任务抽取接口（便于测试替换） */
export interface AiTaskAnalyzer {
  extract(input: {
    now: string
    timezone: string
    participants: Array<{ id: string; name: string }>
    messages: Array<{
      senderId: string
      senderName: string
      content: string
      sentAt: string
    }>
  }): Promise<ExtractedTask | null>
}

export type { TaskStatus }
