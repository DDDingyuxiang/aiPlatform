/** 对话模块类型（与后端 conversations 模块的契约保持一致） */

export interface ChatParticipant {
  id: string
  name: string
}

export type ConversationType = 'direct' | 'group'

export interface Conversation {
  id: string
  type: ConversationType
  /** 私聊为对方姓名；群聊为群名称 */
  name: string
  /** 含自己的全部参与者 */
  participants: ChatParticipant[]
  /** 当前用户未读数 */
  unread: number
  /** ISO 8601 */
  updatedAt: string
  /** 列表预览文案 */
  lastMessage: string
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  content: string
  /** ISO 8601 */
  sentAt: string
}

export interface CreateConversationPayload {
  /** 不含自己（由后端从鉴权上下文补全） */
  memberIds: string[]
}

export interface SendMessagePayload {
  content: string
}
