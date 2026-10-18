/** 知识库接口（经统一 HTTP 客户端） */
import { http } from '@/core/http'
import type {
  KnowledgeDoc,
  KnowledgeSearchResult,
  UploadKnowledgeInput,
} from './types'

export const knowledgeApi = {
  documents: () => http.get<KnowledgeDoc[]>('/knowledge/documents'),

  /**
   * 上传文档：文件本体作为请求体，元数据放在查询参数中。
   * 服务端会解析文本、分块并写入向量索引，耗时取决于文档大小与模型速度。
   */
  upload: (input: UploadKnowledgeInput) =>
    http.post<KnowledgeDoc>('/knowledge/documents', input.file, {
      params: {
        title: input.title,
        category: input.category,
        tags: input.tags.length > 0 ? input.tags.join(',') : undefined,
        fileName: input.file.name,
      },
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Type': input.file.type || 'application/octet-stream',
      },
      timeoutMs: 300_000,
    }),

  search: (query: string, limit?: number) =>
    http.get<KnowledgeSearchResult>('/knowledge/search', {
      params: { q: query, limit },
      timeoutMs: 60_000,
    }),

  /** 下载原始文件需要携带 Bearer 令牌，因此先取回 Blob */
  download: (documentId: string) =>
    http.getBlob(
      `/knowledge/documents/${encodeURIComponent(documentId)}/download`,
    ),
}
