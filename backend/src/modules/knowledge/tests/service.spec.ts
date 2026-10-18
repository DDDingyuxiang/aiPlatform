import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { LocalFileStorage } from '../../../infra/local-storage.js'
import type { VectorStore } from '../../../infra/qdrant.js'
import type { EmbeddingService } from '../../ai/index.js'
import { createKnowledgeService } from '../service.js'
import type {
  KnowledgeChunkRecord,
  KnowledgeDocumentRecord,
  KnowledgeRepository,
} from '../types.js'

const auth = { tenantId: '1', employeeId: '2', publicId: 'p-1' }

const documentRecord: KnowledgeDocumentRecord = {
  documentId: '10',
  publicId: '01KDOC0000000000000000001',
  knowledgeBaseId: '1',
  title: '差旅费用报销标准',
  category: 'policy',
  fileType: 'txt',
  status: 'ready',
  sizeBytes: 320,
  updatedAt: '2026-10-18T00:00:00.000Z',
  tags: ['报销', '差旅'],
  summary: '',
  fileName: '差旅费用报销标准.md',
  owner: {
    publicId: 'p-1',
    name: '王立',
    department: '综合管理部',
  },
}

const chunkRecord: KnowledgeChunkRecord = {
  chunkId: '1',
  chunkIndex: 0,
  content: '一线城市每晚上限 600 元，二线城市每晚上限 450 元。',
  documentPublicId: documentRecord.publicId,
  title: documentRecord.title,
  category: documentRecord.category,
  fileType: documentRecord.fileType,
  updatedAt: documentRecord.updatedAt,
}

function setup() {
  const repository: KnowledgeRepository = {
    listDocuments: vi.fn(async () => [documentRecord]),
    findDocument: vi.fn(async () => documentRecord),
    ensureDefaultKnowledgeBase: vi.fn(async () => ({ id: '1', publicId: 'kb-1' })),
    ensureEmbeddingProfile: vi.fn(async () => '7'),
    createDocument: vi.fn(async (_tenantId, record) => ({
      documentId: '10',
      versionId: '20',
      chunkIds: record.chunks.map((_, index) => String(index + 1)),
    })),
    markDocumentReady: vi.fn(async () => {}),
    markDocumentFailed: vi.fn(async () => {}),
    loadChunksByIds: vi.fn(async () => [chunkRecord]),
    findDocumentFile: vi.fn(async () => ({
      storageKey: '1/doc/v1',
      fileName: documentRecord.fileName,
      mimeType: 'text/markdown',
      sizeBytes: documentRecord.sizeBytes,
    })),
  }

  const embeddings: EmbeddingService = {
    embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0, 0])),
  }

  const vectors: VectorStore = {
    ensureCollection: vi.fn(async () => {}),
    upsert: vi.fn(async () => {}),
    search: vi.fn(async () => [{ id: 1, score: 0.82, payload: {} }]),
    deleteDocument: vi.fn(async () => {}),
  }

  const storage: LocalFileStorage = {
    save: vi.fn(async () => {}),
    open: vi.fn(async () => Readable.from(['file']) as never),
    remove: vi.fn(async () => {}),
  }

  const service = createKnowledgeService({
    repository,
    embeddings,
    vectors,
    storage,
    collectionName: 'document_chunks',
    vectorSize: 4,
    maxUploadBytes: 10 * 1024 * 1024,
    searchLimit: 6,
    chunkSize: 350,
    chunkOverlap: 60,
  })

  return { service, repository, embeddings, vectors, storage }
}

describe('knowledge service', () => {
  it('上传文本后解析、分块、写入向量并标记 ready', async () => {
    const { service, repository, embeddings, vectors, storage } = setup()
    const text = [
      '# 差旅费用报销标准',
      '员工出差住宿费按城市分级，一线城市每晚上限 600 元，二线城市每晚上限 450 元。',
      '电子发票可在报销系统中自动校验，纸质票据须在出差结束后 10 个工作日内提交。',
    ].join('\n')

    const result = await service.upload(auth, {
      title: '差旅费用报销标准',
      category: 'policy',
      tags: '报销,差旅',
      fileName: '差旅费用报销标准.md',
      data: Buffer.from(text),
    })

    expect(result.id).toBe(documentRecord.publicId)
    expect(storage.save).toHaveBeenCalledWith(
      expect.stringMatching(/^1\/[0-9A-Z]{26}\/v1$/),
      expect.any(Buffer),
    )
    expect(embeddings.embed).toHaveBeenCalled()
    expect(vectors.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          vector: [1, 0, 0, 0],
          payload: expect.objectContaining({
            tenant_id: 1,
            knowledge_base_id: 1,
            document_id: 10,
            document_version_id: 20,
            chunk_id: 1,
          }),
        }),
      ]),
    )
    expect(repository.markDocumentReady).toHaveBeenCalledWith(
      '1',
      '10',
      '20',
      [expect.objectContaining({ chunkId: '1', pointId: '1' })],
    )
  })

  it('索引失败时标记 failed 并保留错误信息', async () => {
    const { service, repository, vectors } = setup()
    vi.mocked(vectors.upsert).mockRejectedValueOnce(new Error('qdrant down'))

    await expect(
      service.upload(auth, {
        title: '测试',
        category: 'tech',
        fileName: '测试.txt',
        data: Buffer.from('这是一段足够长的测试文档内容，用于触发索引失败分支。'),
      }),
    ).rejects.toMatchObject({ status: 503 })

    expect(repository.markDocumentFailed).toHaveBeenCalledWith(
      '1',
      '10',
      '20',
      'qdrant down',
    )
  })

  it('拒绝不支持的文件类型与超大文件', async () => {
    const { service, repository, embeddings, vectors, storage } = setup()
    await expect(
      service.upload(auth, {
        title: '图片',
        category: 'tech',
        fileName: '截图.png',
        data: Buffer.from('not an image'),
      }),
    ).rejects.toMatchObject({ status: 400 })

    const small = createKnowledgeService({
      repository,
      embeddings,
      vectors,
      storage,
      collectionName: 'document_chunks',
      vectorSize: 4,
      maxUploadBytes: 10,
      searchLimit: 6,
      chunkSize: 350,
      chunkOverlap: 60,
    })
    await expect(
      small.upload(auth, {
        title: '大文件',
        category: 'tech',
        fileName: '大文件.txt',
        data: Buffer.from('超过十个字节的测试内容'),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('语义检索合并 Qdrant 命中与 MySQL 分块，并保留租户过滤', async () => {
    const { service, repository, vectors } = setup()

    const result = await service.search(auth, { q: '住宿费上限' })

    expect(vectors.search).toHaveBeenCalledWith(
      [1, 0, 0, 0],
      '1',
      6,
    )
    expect(repository.loadChunksByIds).toHaveBeenCalledWith('1', ['1'])
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]).toMatchObject({
      documentId: documentRecord.publicId,
      title: documentRecord.title,
      chunkIndex: 0,
      score: 0.82,
    })
  })

  it('下载返回原始文件元数据与流', async () => {
    const { service, storage } = setup()

    const file = await service.download(auth, documentRecord.publicId)

    expect(file).toMatchObject({
      fileName: documentRecord.fileName,
      mimeType: 'text/markdown',
      sizeBytes: documentRecord.sizeBytes,
    })
    expect(storage.open).toHaveBeenCalledWith('1/doc/v1')
  })
})
