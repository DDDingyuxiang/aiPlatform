/**
 * 对话模块类型（来源于前后端共享契约）。
 *
 * 保留 `Message` 这一模块内别名，避免视图层大面积改名。
 */
export type {
  ChatMessage,
  ChatMessageType,
  Conversation,
  ConversationType,
  ChatParticipant,
  CreateConversationPayload,
  MessageAttachment,
  SendMessagePayload,
} from '@aiplatform/contracts'

export type { ChatMessage as Message } from '@aiplatform/contracts'
