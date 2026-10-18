import { ulid } from 'ulid'
import type {
  ChatMessage,
  Conversation,
  CreateConversationPayload,
  SendMessagePayload,
} from '@aiplatform/contracts'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { Logger } from '../../shared/logger.js'
import type { AuthContext } from '../identity/index.js'
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

function toConversation(record: ConversationRecord, selfEmployeeId: string): Conversation {
  const others = record.participants.filter(
    (participant) => participant.employeeId !== selfEmployeeId,
  )
  const name =
    record.type === 'group'
      ? (record.title ?? autoGroupName(others.map((participant) => participant.name)))
      : (others.at(0)?.name ?? '')

  return {
    id: record.publicId,
    type: record.type,
    name,
    participants: record.participants.map((participant) => ({
      id: participant.publicId,
      name: participant.name,
    })),
    // 首期未记录已读回执，未读数固定为 0
    unread: 0,
    updatedAt: record.updatedAt,
    lastMessage: record.lastMessage,
  }
}

export function createConversationsService(
  options: ConversationsServiceOptions,
): ConversationsService {
  const { repository, storage, logger, maxUploadBytes } = options

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

  return {
    async list(auth) {
      const conversations = await repository.listConversations(
        auth.tenantId,
        auth.employeeId,
      )
      return conversations.map((conversation) =>
        toConversation(conversation, auth.employeeId),
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
        if (existing) return toConversation(existing, auth.employeeId)
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
      return toConversation(created, auth.employeeId)
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
      return toChatMessage(message)
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
      try {
        const message = await repository.createMessage(
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
        return toChatMessage(message)
      } catch (error) {
        // 数据库写入失败时清理已落盘的文件，避免产生孤儿附件
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
  }
}
