/**
 * 知识库接口的 Mock 实现（演示数据，后端 knowledge 模块就绪后整体删除）。
 * 上传仅记录元数据（不传输文件内容）；真实环境文件走对象存储、索引走向量库。
 */
import { defineMock, fail } from '@/core/http'
import { findMockUserId } from '@/core/auth/mock'
import { MEMBERS } from '@/modules/identity/data'
import { DEMO_DOCS } from './data'
import type { KnowledgeDoc, UploadDocPayload } from './types'

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

defineMock('POST', '/knowledge/documents', ({ body, token }) => {
  const userId = findMockUserId(token)
  if (!userId) return fail(40100, '登录状态已失效', 401)
  const payload = body as UploadDocPayload | undefined
  const title = payload?.title?.trim()
  if (!title) return fail(40020, '材料名称不能为空', 400)
  if (!payload?.fileName || !payload?.fileType) return fail(40021, '缺少文件信息', 400)

  const member = MEMBERS.find((item) => item.id === userId)
  const doc: KnowledgeDoc = {
    id: `k-${Date.now()}`,
    title,
    category: payload.category ?? 'policy',
    fileType: payload.fileType,
    sizeBytes: payload.sizeBytes ?? 0,
    owner: { id: userId, name: member?.name ?? userId },
    department: member?.department ?? '',
    updatedAt: new Date().toISOString(),
    tags: payload.tags ?? [],
    summary: '',
  }
  documents.unshift(doc)
  return { ...doc, tags: [...doc.tags] }
})
