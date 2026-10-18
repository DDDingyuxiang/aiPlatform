/** conversations 模块唯一公共入口 */
export { createConversationsService } from './service.js'
export { createMySqlConversationsRepository } from './repository.js'
export { createLocalAttachmentStorage } from './storage.js'
export { createConversationsRouter } from './router.js'
export {
  createMemoryUnreadStore,
  createRedisUnreadStore,
} from './unread-store.js'
export type { UnreadStore } from './unread-store.js'
export type {
  AttachmentStorage,
  ConversationsRepository,
  ConversationsService,
} from './types.js'
