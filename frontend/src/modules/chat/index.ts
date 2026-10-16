/** chat 模块公开导出：跨模块仅可经由本文件引用 */
export { default as ChatView } from './ChatView.vue'
export { default as ConversationList } from './components/ConversationList.vue'
export { useChatStore } from './store'
export type { ChatParticipant, Conversation, ConversationType, Message } from './types'
