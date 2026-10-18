/** 知识库类型（来源于共享契约） */
import type { KnowledgeDocCategory, KnowledgeDocFileType } from '@aiplatform/contracts'

export type {
  KnowledgeDoc,
  KnowledgeDocCategory as DocCategory,
  KnowledgeDocFileType as DocFileType,
  KnowledgeDocStatus,
  KnowledgeSearchHit,
  KnowledgeSearchResult,
} from '@aiplatform/contracts'

/** 上传参数：文件本体 + 展示元数据 */
export interface UploadKnowledgeInput {
  file: File
  title: string
  category: KnowledgeDocCategory
  tags: string[]
}

/** 允许上传的扩展名 → 文件类型映射（与服务端解析器保持一致） */
export const EXTENSION_TYPE_MAP: Record<string, KnowledgeDocFileType> = {
  pdf: 'pdf',
  docx: 'doc',
  xls: 'xls',
  xlsx: 'xls',
  pptx: 'ppt',
  txt: 'txt',
  md: 'txt',
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** 允许上传的扩展名（用于 input accept） */
export const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.pptx,.txt,.md'
