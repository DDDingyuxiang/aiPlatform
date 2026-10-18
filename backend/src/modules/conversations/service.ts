import { ulid } from 'ulid'
import type {
  ChatMessage,
  Conversation,
  CreateConversationPayload,
  SendMessagePayload,
} from '@aiplatform/contracts'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { Logger } from '../../shared/logger.js'
import { formatDateTimeInTimeZone } from '../../shared/time-zone.js'
import { userTopic, type RealtimeBus } from '../../infra/realtime.js'
import type { AuthContext } from '../identity/index.js'
import {
  hasFutureTimeExpression,
  type ChatTaskExtractor,
} from '../tasks/index.js'
import type { UnreadStore } from './unread-store.js'
import type {
  AttachmentStorage,
  ConversationsRepository,
  ConversationsService,
  ConversationRecord,
  MessageRecord,
} from './types.js'

export interface ConversationsServiceOptions {
  repository: ConversationsRepository
  storage: AttachmentStorage
  /** Redis 实时事件总线；推送失败不影响消息落库 */
  realtime: RealtimeBus
  /** Redis 未读数 */
  unread: UnreadStore
  /** 业务时区，用于 AI 任务抽取与提示文案 */
  timezone: string
  /** 对话中的未来时间表达触发 AI 创建任务；未注入时不启用 */
  taskExtractor?: ChatTaskExtractor
  logger?: Logger
  /** 单个附件大小上限（字节）；路由层会先做一次同样的限制 */
  maxUploadBytes: number
}

/** 群聊自动命名：不超过两人直接连接，否则「甲、乙等 N 人群聊」 */
function autoGroupName(names: string[]): string {
  if (names.length <= 2) return names.join('、')
  return `${names.slice(0, 2).join('、')}等 ${names.length} 人群聊`
}

/** 文件名只用于展示与下载响应头，去除路径与控制字符 */
function sanitizeFileName(value: string): string {
  const cleaned = value
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255)
  if (!cleaned) {
    throw new AppError(ErrorCode.INVALID_PAYLOAD, '文件名不能为空', 400)
  }
  return cleaned
}

function normalizeMimeType(value: string): string {
  const mime = value.split(';')[0]?.trim().toLowerCase() ?? ''
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mime)
    ? mime
    : 'application/octet-stream'
}

function toChatMessage(record: MessageRecord): ChatMessage {
  return {
    id: record.id,
    conversationId: record.conversationPublicId,
    senderId: record.senderPublicId,
    content: record.content,
    type: record.type,
    attachments: record.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    })),
    sentAt: record.sentAt,
  }
}

/** 会话在某个成员视角下的显示名称 */
function conversationName(
  record: ConversationRecord,
  viewerEmployeeId: string,
): string {
  const others = record.participants.filter(
    (participant) => participant.employeeId !== viewerEmployeeId,
  )
  return record.type === 'group'
    ? (record.title ?? autoGroupName(others.map((participant) => participant.name)))
    : (others.at(0)?.name ?? '')
}

function toConversation(
  record: ConversationRecord,
  selfEmployeeId: string,
  unread: number,
): Conversation {
  return {
    id: record.publicId,
    type: record.type,
    name: conversationName(record, selfEmployeeId),
    participants: record.participants.map((participant) => ({
      id: participant.publicId,
      name: participant.name,
    })),
    unread,
    updatedAt: record.updatedAt,
    lastMessage: record.lastMessage,
  }
}

/** 消息在会话列表/通知中的预览文案 */
function messagePreview(message: ChatMessage): string {
  if (message.type === 'image' || message.type === 'file') {
    const label = message.type === 'image' ? '[图片]' : '[文件]'
    const name = message.attachments.at(0)?.fileName
    return name ? `${label} ${name}` : label
  }
  return message.content
}

export function createConversationsService(
  options: ConversationsServiceOptions,
): ConversationsService {
  const {
    repository,
    storage,
    realtime,
    unread,
    timezone,
    taskExtractor,
    logger,
    maxUploadBytes,
  } = options

  function notFound(message = '会话不存在'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, 404)
  }

  function invalid(message: string): AppError {
    return new AppError(ErrorCode.INVALID_PAYLOAD, message, 400)
  }

  /** 会话成员校验：非成员与不存在返回同一个 404，避免泄露会话信息 */
  async function requireConversation(
    auth: AuthContext,
    conversationPublicId: string,
  ): Promise<ConversationRecord> {
    const conversation = await repository.findConversationForMember(
      auth.tenantId,
      conversationPublicId,
      auth.employeeId,
    )
    if (!conversation) throw notFound()
    return conversation
  }

  /**
   * 消息落库后推送实时事件并累加接收方未读数。
   *
   * 推送属于尽力而为：失败只记录日志，不回滚已经持久化的消息。
   */
  async function publishMessage(
    auth: AuthContext,
    conversation: ConversationRecord,
    messageRecord: MessageRecord,
    options: { incrementUnread?: boolean; notify?: boolean } = {},
  ): Promise<ChatMessage> {
    const { incrementUnread = true, notify = true } = options
    const message = toChatMessage(messageRecord)
    const preview = messagePreview(message)
    const sender = conversation.participants.find(
      (participant) => participant.employeeId === auth.employeeId,
    )

    // 先完成未读数累加，再推送消息事件：
    // 否则客户端收到事件后调用“已读”可能早于累加完成，未读数会残留。
    const unreadTasks = incrementUnread
      ? conversation.participants
          .filter((participant) => participant.employeeId !== auth.employeeId)
          .map((participant) =>
            unread.increment(
              auth.tenantId,
              participant.employeeId,
              conversation.publicId,
            ),
          )
      : []
    await Promise.allSettled(unreadTasks)

    const publishTasks: Array<Promise<unknown>> = []
    for (const participant of conversation.participants) {
      const name = conversationName(conversation, participant.employeeId)

      // 所有参与者（含发送者）都收到消息事件，便于多标签页/多端同步
      publishTasks.push(
        realtime.publish(userTopic(auth.tenantId, participant.employeeId), {
          type: 'chat.message',
          payload: {
            conversationId: conversation.publicId,
            conversationName: name,
            message,
          },
        }),
      )

      if (!notify || participant.employeeId === auth.employeeId) continue

      publishTasks.push(
        realtime.publish(userTopic(auth.tenantId, participant.employeeId), {
          type: 'notification',
          payload: {
            kind: 'chat.message',
            conversationId: conversation.publicId,
            conversationName: name,
            senderId: auth.publicId,
            senderName: sender?.name ?? '',
            preview,
          },
        }),
      )
    }

    const results = await Promise.allSettled(publishTasks)
    const failed = results.filter((result) => result.status === 'rejected')
    if (failed.length > 0) {
      logger?.warn('conversations.realtime_publish_failed', {
        conversationId: conversation.publicId,
        failed: failed.length,
      })
    }

    return message
  }

  /**
   * 对话中出现未来时间表达时，异步让 AI 判断并创建任务。
   *
   * 不阻塞消息发送；失败只记录日志。任务创建成功后：
   * 1. 向负责人/创建人推送 task.created；
   * 2. 在会话中插入一条 system 消息作为可见反馈（不增加未读）。
   */
  async function analyzeTaskFromMessage(
    auth: AuthContext,
    conversation: ConversationRecord,
    messageRecord: MessageRecord,
  ): Promise<void> {
    if (!taskExtractor || !hasFutureTimeExpression(messageRecord.content)) return

    try {
      const history = await repository.listMessages(
        auth.tenantId,
        conversation.conversationId,
      )
      const nameByPublicId = new Map(
        conversation.participants.map((participant) => [
          participant.publicId,
          participant.name,
        ]),
      )
      // 系统消息是 AI 生成的任务通知，不作为新一轮任务抽取的上下文
      const recentMessages = history
        .filter((message) => message.type !== 'system')
        .slice(-10)
        .map((message) => ({
          senderId: message.senderPublicId,
          senderName: nameByPublicId.get(message.senderPublicId) ?? '',
          content: message.content,
          sentAt: message.sentAt,
        }))

      const result = await taskExtractor.analyzeChatMessage({
        auth,
        conversation: {
          conversationId: conversation.conversationId,
          publicId: conversation.publicId,
          type: conversation.type,
          title: conversation.title,
          participants: conversation.participants.map((participant) => ({
            employeeId: participant.employeeId,
            publicId: participant.publicId,
            name: participant.name,
          })),
        },
        message: {
          id: messageRecord.id,
          senderPublicId: messageRecord.senderPublicId,
          content: messageRecord.content,
          sentAt: messageRecord.sentAt,
        },
        recentMessages,
        timezone,
      })

      if (!result) return

      const taskEvent = {
        type: 'task.created',
        payload: {
          conversationId: conversation.publicId,
          task: result.task,
        },
      }
      const recipients = [...new Set([
        result.assigneeEmployeeId,
        result.creatorEmployeeId,
      ])]
      await Promise.allSettled(
        recipients.map((employeeId) =>
          realtime.publish(userTopic(auth.tenantId, employeeId), taskEvent),
        ),
      )

      const dueLabel = formatDateTimeInTimeZone(result.task.dueAt, timezone)
      const notice =
        `AI 已根据对话创建任务「${result.task.title}」，` +
        `负责人：${result.assigneeName}，截止：${dueLabel}`
      const systemMessage = await repository.createMessage(
        auth.tenantId,
        conversation,
        auth.employeeId,
        { type: 'system', content: notice },
      )
      await publishMessage(auth, conversation, systemMessage, {
        incrementUnread: false,
        notify: false,
      })
    } catch (error) {
      logger?.warn('conversations.task_extraction_failed', {
        conversationId: conversation.publicId,
        messageId: messageRecord.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    async list(auth) {
      const conversations = await repository.listConversations(
        auth.tenantId,
        auth.employeeId,
      )
      const unreadCounts = await Promise.all(
        conversations.map((conversation) =>
          unread.get(auth.tenantId, auth.employeeId, conversation.publicId),
        ),
      )
      return conversations.map((conversation, index) =>
        toConversation(conversation, auth.employeeId, unreadCounts[index] ?? 0),
      )
    },

    async create(auth, payload: CreateConversationPayload) {
      // 前端不传自己；即使误传也由服务端剔除，避免自聊会话
      const requestedIds = [...new Set(payload.memberIds)].filter(
        (id) => id !== auth.publicId,
      )
      if (requestedIds.length === 0) throw invalid('至少选择一位成员')

      const members = await repository.findEmployeesByPublicIds(
        auth.tenantId,
        requestedIds,
      )
      if (members.length !== requestedIds.length) {
        throw invalid('成员不存在或不属于当前企业')
      }
      if (members.some((member) => member.status !== 'active')) {
        throw invalid('不能与已停用员工发起会话')
      }

      const otherEmployeeIds = members.map((member) => member.employeeId)

      // 两人私聊复用已有会话，避免同一对成员产生重复会话
      if (otherEmployeeIds.length === 1) {
        const existing = await repository.findDirectConversation(
          auth.tenantId,
          auth.employeeId,
          otherEmployeeIds[0]!,
        )
        if (existing) {
          const existingUnread = await unread.get(
            auth.tenantId,
            auth.employeeId,
            existing.publicId,
          )
          return toConversation(existing, auth.employeeId, existingUnread)
        }
      }

      const type = otherEmployeeIds.length === 1 ? 'direct' : 'group'
      const title =
        type === 'group' ? autoGroupName(members.map((member) => member.name)) : null
      const publicId = ulid()

      await repository.createConversation(auth.tenantId, {
        publicId,
        type,
        title,
        createdBy: auth.employeeId,
        memberIds: [auth.employeeId, ...otherEmployeeIds],
      })

      const created = await repository.findConversationForMember(
        auth.tenantId,
        publicId,
        auth.employeeId,
      )
      if (!created) {
        throw new AppError(ErrorCode.INTERNAL, '创建会话后读取失败', 500)
      }
      return toConversation(created, auth.employeeId, 0)
    },

    async listMessages(auth, conversationId) {
      const conversation = await requireConversation(auth, conversationId)
      const messages = await repository.listMessages(
        auth.tenantId,
        conversation.conversationId,
      )
      return messages.map(toChatMessage)
    },

    async sendMessage(auth, conversationId, payload: SendMessagePayload) {
      const conversation = await requireConversation(auth, conversationId)
      const message = await repository.createMessage(
        auth.tenantId,
        conversation,
        auth.employeeId,
        { type: 'text', content: payload.content },
      )
      const chatMessage = await publishMessage(auth, conversation, message)
      // 任务抽取是增强能力，异步执行，不阻塞消息发送
      void analyzeTaskFromMessage(auth, conversation, message)
      return chatMessage
    },

    async sendAttachment(auth, conversationId, input) {
      const conversation = await requireConversation(auth, conversationId)

      if (input.data.length === 0) throw invalid('文件不能为空')
      if (input.data.length > maxUploadBytes) {
        throw new AppError(ErrorCode.INVALID_PAYLOAD, '文件大小超出限制', 413)
      }

      const fileName = sanitizeFileName(input.fileName)
      const mimeType = normalizeMimeType(input.mimeType)
      const type = mimeType.startsWith('image/') ? 'image' : 'file'
      const storageKey = `${auth.tenantId}/${conversation.publicId}/${ulid()}`

      await storage.save(storageKey, input.data)

      let message: MessageRecord
      try {
        message = await repository.createMessage(
          auth.tenantId,
          conversation,
          auth.employeeId,
          {
            type,
            content: input.caption?.trim() ?? '',
            attachment: {
              storageKey,
              fileName,
              mimeType,
              sizeBytes: input.data.length,
            },
          },
        )
      } catch (error) {
        // 仅数据库写入失败时清理文件；推送失败不回滚已持久化的消息
        await storage.remove(storageKey).catch((cleanupError: unknown) => {
          logger?.warn('conversations.attachment_cleanup_failed', {
            storageKey,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          })
        })
        throw error
      }

      return publishMessage(auth, conversation, message)
    },

    async getAttachment(auth, conversationId, attachmentId) {
      const attachment = await repository.findAttachmentForMember(
        auth.tenantId,
        conversationId,
        attachmentId,
        auth.employeeId,
      )
      if (!attachment) throw notFound('附件不存在')

      let stream
      try {
        stream = await storage.open(attachment.storageKey)
      } catch {
        throw notFound('附件文件不存在')
      }

      return {
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        stream,
      }
    },

    async markRead(auth, conversationId) {
      const conversation = await requireConversation(auth, conversationId)
      await unread.reset(auth.tenantId, auth.employeeId, conversation.publicId)
      return { ok: true }
    },
  }
}
