/** ai 模块唯一公共入口 */
export { createAiService } from './service.js'
export { createAiConversationService } from './chat-service.js'
export { createSummaryService } from './summary.js'
export { createMySqlAiChatRepository } from './repository.js'
export { createAiRouter } from './router.js'
export { createEmbeddingService } from './embeddings.js'
export type {
  AiChatService,
  AiConversationService,
  AiKnowledgeChunk,
  EmbeddingService,
  KnowledgeRetriever,
} from './types.js'
