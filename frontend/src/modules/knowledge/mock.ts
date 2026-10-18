/**
 * 知识库接口的 Mock 实现（演示数据，真实后端由 knowledge 模块提供）。
 * 上传仅生成元数据；文本解析、向量化与检索在真实后端完成。
 */
import { defineMock, fail } from '@/core/http'
import { findMockUserId } from '@/core/auth/mock'
import { MEMBERS } from '@/modules/identity'
import { DEMO_DOCS } from './data'
import { EXTENSION_TYPE_MAP, type KnowledgeDoc } from './types'

const documents: KnowledgeDoc[] = DEMO_DOCS.map((item) => ({ ...item, tags: [...item.tags] }))

defineMock(
  'GET',
  '/knowledge/documents',
  ({ token }) => {
    if (!findMockUserId(token)) return fail(40100, '登录状态已失效', 401)
    return documents
      .map((item) => ({ ...item, tags: [...item.tags] }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  { delayMs: 250 },
)

defineMock('POST', '/knowledge/documents', ({ body, query, token }) => {
  const userId = findMockUserId(token)
  if (!userId) return fail(40100, '登录状态已失效', 401)

  const title = query.title?.trim()
  if (!title) return fail(40020, '材料名称不能为空', 400)
  const fileName = query.fileName?.trim()
  if (!fileName) return fail(40021, '缺少文件信息', 400)

  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  const fileType = EXTENSION_TYPE_MAP[extension]
  if (!fileType) return fail(40022, '不支持的文件类型', 400)

  const sizeBytes = body instanceof Blob ? body.size : 0
  if (sizeBytes > 10 * 1024 * 1024) return fail(40023, '文件超过 10MB 限制', 400)

  const member = MEMBERS.find((item) => item.id === userId)
  const category = query.category ?? 'policy'
  const doc: KnowledgeDoc = {
    id: `k-${Date.now()}`,
    title,
    category: ['policy', 'product', 'tech', 'market', 'training'].includes(category)
      ? (category as KnowledgeDoc['category'])
      : 'policy',
    fileType,
    sizeBytes,
    owner: { id: userId, name: member?.name ?? userId },
    department: member?.department ?? '',
    updatedAt: new Date().toISOString(),
    tags: (query.tags ?? '').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    summary: '',
    status: 'ready',
    fileName,
  }
  documents.unshift(doc)
  return { ...doc, tags: [...doc.tags] }
})

defineMock(
  'GET',
  '/knowledge/search',
  ({ query, token }) => {
    if (!findMockUserId(token)) return fail(40100, '登录状态已失效', 401)
    const q = query.q?.trim() ?? ''
    if (!q) return fail(40024, '搜索内容不能为空', 400)
    const terms = q.split(/\s+/).filter(Boolean)
    const hits = documents
      .filter((doc) => {
        const haystack = `${doc.title} ${doc.tags.join(' ')} ${doc.summary}`
        return terms.some((term) => haystack.includes(term))
      })
      .slice(0, 6)
      .map((doc) => ({
        documentId: doc.id,
        title: doc.title,
        category: doc.category,
        fileType: doc.fileType,
        chunkIndex: 0,
        content: doc.summary || doc.title,
        score: 0.9,
        updatedAt: doc.updatedAt,
      }))
    return { query: q, hits }
  },
  { delayMs: 200 },
)
