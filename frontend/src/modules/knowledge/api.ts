/** 知识库接口（经统一 HTTP 客户端，开发环境由 mock.ts 拦截） */
import { http } from '@/core/http'
import type { KnowledgeDoc, UploadDocPayload } from './types'

export const knowledgeApi = {
  documents: () => http.get<KnowledgeDoc[]>('/knowledge/documents'),
  upload: (payload: UploadDocPayload) => http.post<KnowledgeDoc>('/knowledge/documents', payload),
}
