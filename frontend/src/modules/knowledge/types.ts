/** 知识库类型（与后端 knowledge 模块的契约保持一致） */

export type DocCategory = 'policy' | 'product' | 'tech' | 'market' | 'training'
export type DocFileType = 'pdf' | 'doc' | 'xls' | 'ppt' | 'img'

export interface KnowledgeDoc {
  id: string
  title: string
  category: DocCategory
  fileType: DocFileType
  sizeBytes: number
  owner: { id: string; name: string }
  department: string
  /** ISO 8601 */
  updatedAt: string
  tags: string[]
  /** AI 摘要（由 AI 能力层生成，展示时必须标注来源） */
  summary: string
}

export interface UploadDocPayload {
  title: string
  category: DocCategory
  tags: string[]
  fileName: string
  fileType: DocFileType
  sizeBytes: number
}

/** 允许上传的扩展名 → 文件类型映射（与服务端校验保持一致） */
export const EXTENSION_TYPE_MAP: Record<string, DocFileType> = {
  pdf: 'pdf',
  doc: 'doc',
  docx: 'doc',
  xls: 'xls',
  xlsx: 'xls',
  ppt: 'ppt',
  pptx: 'ppt',
  png: 'img',
  jpg: 'img',
  jpeg: 'img',
  gif: 'img',
  webp: 'img',
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
