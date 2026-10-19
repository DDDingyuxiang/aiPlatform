/** 知识库接口（经统一 HTTP 客户端） */
import { http } from '@/core/http'
import type {
  KnowledgeDoc,
  KnowledgeDocumentStatus,
  KnowledgeDocumentVersion,
  KnowledgeSearchResult,
  UploadKnowledgeInput,
} from './types'

export const knowledgeApi = {
  documents: () => http.get<KnowledgeDoc[]>('/knowledge/documents'),

  /**
   * 上传文档：文件本体作为请求体，元数据放在查询参数中。
   * 服务端只落库并投递索引任务，解析/向量化由 Worker 异步完成。
   */
  upload: (input: UploadKnowledgeInput) =>
    http.post<KnowledgeDoc>('/knowledge/documents', input.file, {
      params: {
        title: input.title,
        category: input.category,
        tags: input.tags.length > 0 ? input.tags.join(',') : undefined,
        fileName: input.file.name,
        forceCreate: input.forceCreate === true ? 'true' : undefined,
      },
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Type': input.file.type || 'application/octet-stream',
      },
      timeoutMs: 300_000,
    }),

  /** 显式上传新版本：文件本体或元数据都不变，只追加版本 */
  uploadVersion: (documentId: string, file: File) =>
    http.post<KnowledgeDoc>(
      `/knowledge/documents/${encodeURIComponent(documentId)}/versions`,
      file,
      {
        params: { fileName: file.name },
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Type': file.type || 'application/octet-stream',
        },
        timeoutMs: 300_000,
      },
    ),

  versions: (documentId: string) =>
    http.get<KnowledgeDocumentVersion[]>(
      `/knowledge/documents/${encodeURIComponent(documentId)}/versions`,
    ),

  status: (documentId: string, versionNo?: number) =>
    http.get<KnowledgeDocumentStatus>(
      `/knowledge/documents/${encodeURIComponent(documentId)}/status`,
      { params: { versionNo } },
    ),

  activateVersion: (documentId: string, versionNo: number) =>
    http.post<KnowledgeDoc>(
      `/knowledge/documents/${encodeURIComponent(documentId)}/versions/${versionNo}/activate`,
      {},
    ),

  reindexVersion: (documentId: string, versionNo: number) =>
    http.post<KnowledgeDocumentVersion>(
      `/knowledge/documents/${encodeURIComponent(documentId)}/versions/${versionNo}/reindex`,
      {},
      { timeoutMs: 300_000 },
    ),

  deleteDocument: (documentId: string) =>
    http.delete<{ deleted: boolean }>(
      `/knowledge/documents/${encodeURIComponent(documentId)}`,
    ),

  search: (query: string, limit?: number) =>
    http.get<KnowledgeSearchResult>('/knowledge/search', {
      params: { q: query, limit },
      timeoutMs: 60_000,
    }),

  /** 下载原始文件需要携带 Bearer 令牌，因此先取回 Blob */
  download: (documentId: string, versionNo?: number) =>
    http.getBlob(
      `/knowledge/documents/${encodeURIComponent(documentId)}/download`,
      { params: { versionNo } },
    ),
}
