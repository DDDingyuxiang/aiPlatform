/**
 * 聊天附件存储：复用通用本地文件存储适配器。
 * 保留原有导出名，避免 conversations 模块的公开接口发生变化。
 */
export { createLocalFileStorage as createLocalAttachmentStorage } from '../../infra/local-storage.js'
