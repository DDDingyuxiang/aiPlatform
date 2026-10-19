import type { ReadStream } from 'node:fs'
import type {
  ChatMessage,
  ChatMessageType,
  Conversation,
  CreateConversationPayload,
  SendMessagePayload,
} from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'

/** 当前租户内可用于会话的员工 */
export interface EmployeeRefRecord {
  employeeId: string
  publicId: string
  name: string
  status: string
}

/** 会话参与者（employeeId 为内部 ID，仅服务端使用） */
export interface ConversationMemberRecord {
  employeeId: string
  publicId: string
  name: string
}

/** 会话原始记录；名称由服务层按“对方姓名/群标题”计算 */
export interface ConversationRecord {
  conversationId: string
  publicId: string
  type: 'direct' | 'group'
  title: string | null
  participants: ConversationMemberRecord[]
  /** 最后一条消息的预览文案（已按消息类型格式化） */
  lastMessage: string
  /** 最后活跃时间（无消息时取创建时间） */
  updatedAt: string
}

export interface AttachmentRecord {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  storageKey: string
}

export interface MessageRecord {
  id: string
  conversationId: string
  conversationPublicId: string
  senderPublicId: string
  content: string
  type: ChatMessageType
  attachments: AttachmentRecord[]
  sentAt: string
}

export interface ConversationRefRecord {
  conversationId: string
  publicId: string
  type: 'direct' | 'group'
  title: string | null
}

export interface CreateConversationRecord {
  publicId: string
  type: 'direct' | 'group'
  title: string | null
  /** 创建人员工内部 ID */
  createdBy: string
  /** 含创建人在内的全部成员内部 ID */
  memberIds: string[]
}

export interface AttachmentInputRecord {
  storageKey: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

export interface CreateMessageRecord {
  type: ChatMessageType
  content: string
  attachment?: AttachmentInputRecord
}

/** 附件下载结果；路径由存储适配器安全解析 */
export interface AttachmentDownloadRecord {
  fileName: string
  mimeType: string
  sizeBytes: number
  stream: ReadStream
}

/** conversations 模块的数据访问接口（MySQL 实现，测试可替换） */
export interface ConversationsRepository {
  /** 按 public_id 查询当前租户内的员工（含离职/停用状态，由服务层判定） */
  findEmployeesByPublicIds(tenantId: string, publicIds: string[]): Promise<EmployeeRefRecord[]>

  /** 查找两人之间已存在的私聊（用于去重） */
  findDirectConversation(
    tenantId: string,
    firstEmployeeId: string,
    secondEmployeeId: string,
  ): Promise<ConversationRecord | null>

  createConversation(tenantId: string, record: CreateConversationRecord): Promise<void>

  /** 当前用户参与的全部活跃会话，按最后消息时间倒序 */
  listConversations(tenantId: string, employeeId: string): Promise<ConversationRecord[]>

  /** 查询单个会话；非成员返回 null（避免泄露会话是否存在） */
  findConversationForMember(
    tenantId: string,
    publicId: string,
    employeeId: string,
  ): Promise<ConversationRecord | null>

  listMessages(tenantId: string, conversationId: string): Promise<MessageRecord[]>

  /** 只取最近 N 条消息（时间正序返回），避免长会话全量读取 */
  listRecentMessages(
    tenantId: string,
    conversationId: string,
    limit: number,
    options?: { excludeSystem?: boolean },
  ): Promise<MessageRecord[]>

  createMessage(
    tenantId: string,
    conversation: ConversationRefRecord,
    senderEmployeeId: string,
    record: CreateMessageRecord,
  ): Promise<MessageRecord>

  /** 附件所属会话的成员校验与元数据读取 */
  findAttachmentForMember(
    tenantId: string,
    conversationPublicId: string,
    attachmentId: string,
    employeeId: string,
  ): Promise<AttachmentRecord | null>
}

/** 附件存储适配器；本期为本地磁盘，后续可替换为对象存储 */
export interface AttachmentStorage {
  save(key: string, data: Buffer): Promise<void>
  open(key: string): Promise<ReadStream>
  remove(key: string): Promise<void>
}

export interface ConversationsService {
  list(auth: AuthContext): Promise<Conversation[]>
  create(auth: AuthContext, payload: CreateConversationPayload): Promise<Conversation>
  listMessages(auth: AuthContext, conversationId: string): Promise<ChatMessage[]>
  sendMessage(
    auth: AuthContext,
    conversationId: string,
    payload: SendMessagePayload,
  ): Promise<ChatMessage>
  sendAttachment(
    auth: AuthContext,
    conversationId: string,
    input: {
      fileName: string
      mimeType: string
      data: Buffer
      caption?: string
    },
  ): Promise<ChatMessage>
  getAttachment(
    auth: AuthContext,
    conversationId: string,
    attachmentId: string,
  ): Promise<AttachmentDownloadRecord>
  /** 打开会话后清零 Redis 未读数 */
  markRead(auth: AuthContext, conversationId: string): Promise<{ ok: boolean }>
}
