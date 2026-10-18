/** ai 模块唯一公共入口 */
export { createAiService } from './service.js'
export { createAiRouter } from './router.js'
export { createEmbeddingService } from './embeddings.js'
export type {
  AiChatService,
  AiKnowledgeChunk,
  EmbeddingService,
  KnowledgeRetriever,
} from './types.js'
