/** knowledge 模块公开导出：跨模块仅可经由本文件引用 */
export { useKnowledgeStore } from './store'
export { default as KnowledgeView } from './KnowledgeView.vue'
export { default as KnowledgeSection } from './components/KnowledgeSection.vue'
export { default as UploadModal } from './components/UploadModal.vue'
export type { DocCategory, DocFileType, KnowledgeDoc, UploadDocPayload } from './types'
export { EXTENSION_TYPE_MAP, MAX_UPLOAD_BYTES } from './types'
