/** knowledge 模块唯一公共入口 */
export { createKnowledgeService } from './service.js'
export { createKnowledgeRouter } from './router.js'
export { createMySqlKnowledgeRepository } from './repository.js'
export type {
  KnowledgeRepository,
  KnowledgeService,
  KnowledgeUploadInput,
  KnowledgeDocumentRecord,
} from './types.js'
