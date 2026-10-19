import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '../../../http/errors.js'
import type { KnowledgeQueue } from '../../../infra/knowledge-queue.js'
import type { LocalFileStorage } from '../../../infra/local-storage.js'
import type { VectorStore } from '../../../infra/qdrant.js'
import type { EmbeddingService } from '../../ai/index.js'
import { createKnowledgeService } from '../service.js'
import type {
  KnowledgeChunkRecord,
  KnowledgeDocumentRecord,
  KnowledgeRepository,
  KnowledgeVersionRecord,
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
  createdBy: '2',
  currentVersionId: '20',
  currentVersionNo: 1,
  versionCount: 1,
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
  versionNo: 1,
}

const versionRecord: KnowledgeVersionRecord = {
  versionId: '20',
  versionNo: 1,
  status: 'failed',
  fileName: '差旅费用报销标准.md',
  fileType: 'txt',
  mimeType: 'text/markdown',
  sizeBytes: 320,
  checksum: 'abc',
  storageKey: '1/doc/v1',
  createdAt: '2026-10-18T00:00:00.000Z',
  isCurrent: false,
  jobStage: 'failed',
  jobProgress: 100,
  errorMessage: '解析失败',
}

function setup() {
  const repository: KnowledgeRepository = {
    listDocuments: vi.fn(async () => [documentRecord]),
    findDocument: vi.fn(async () => documentRecord),
    ensureDefaultKnowledgeBase: vi.fn(async () => ({ id: '1', publicId: 'kb-1' })),
    ensureEmbeddingProfile: vi.fn(async () => '7'),
    findDuplicateContent: vi.fn(async () => null),
    findDocumentsByName: vi.fn(async () => []),
    createPendingDocument: vi.fn(async () => ({
      documentId: '10',
      versionId: '20',
    })),
    createPendingVersion: vi.fn(async () => ({
      versionId: '21',
      versionNo: 2,
    })),
    replaceVersionChunks: vi.fn(async () => ['1']),
    updateVersionParsedInfo: vi.fn(async () => {}),
    startEmbeddingJob: vi.fn(async () => true),
    updateEmbeddingJobProgress: vi.fn(async () => {}),
    markJobSucceeded: vi.fn(async () => {}),
    markVersionReady: vi.fn(async () => {}),
    markVersionFailed: vi.fn(async () => {}),
    queueVersionForRetry: vi.fn(async () => {}),
    resetRunningJobs: vi.fn(async () => {}),
    listPendingJobs: vi.fn(async () => []),
    findIndexTarget: vi.fn(async () => null),
    findEmbeddingJob: vi.fn(async () => ({
      status: 'failed',
      stage: 'failed',
      progress: 100,
      attemptCount: 1,
      errorMessage: '解析失败',
      startedAt: '2026-10-18T00:00:00.000Z',
      finishedAt: '2026-10-18T00:00:01.000Z',
    })),
    listVersions: vi.fn(async () => [versionRecord]),
    findVersion: vi.fn(async () => versionRecord),
    activateVersion: vi.fn(async () => true),
    loadChunksByIds: vi.fn(async () => [chunkRecord]),
    findDocumentFile: vi.fn(async () => ({
      storageKey: '1/doc/v1',
      fileName: documentRecord.fileName,
      mimeType: 'text/markdown',
      sizeBytes: documentRecord.sizeBytes,
      versionNo: 1,
    })),
    softDeleteDocument: vi.fn(async () => ({
      documentId: '10',
      storageKeys: ['1/doc/v1'],
    })),
    markEmbeddingRecordsDeleted: vi.fn(async () => {}),
    cancelEmbeddingJobs: vi.fn(async () => {}),
  }

  const embeddings: EmbeddingService = {
    embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0, 0])),
  }

  const vectors: VectorStore = {
    ensureCollection: vi.fn(async () => {}),
    upsert: vi.fn(async () => {}),
    search: vi.fn(async () => [{ id: 1, score: 0.82, payload: {} }]),
    deleteDocument: vi.fn(async () => {}),
    deleteVersion: vi.fn(async () => {}),
  }

  const storage: LocalFileStorage = {
    save: vi.fn(async () => {}),
    read: vi.fn(async () => Buffer.from('')),
    open: vi.fn(async () => Readable.from(['file']) as never),
    remove: vi.fn(async () => {}),
  }

  const queue: KnowledgeQueue = {
    enqueue: vi.fn(async () => {}),
    take: vi.fn(async () => null),
    ack: vi.fn(async () => {}),
    requeue: vi.fn(async () => {}),
    recover: vi.fn(async () => []),
  }

  const service = createKnowledgeService({
    repository,
    embeddings,
    vectors,
    storage,
    queue,
    vectorSize: 4,
    maxUploadBytes: 10 * 1024 * 1024,
    searchLimit: 6,
    searchOverfetch: 1,
  })

  return { service, repository, embeddings, vectors, storage, queue }
}

describe('knowledge service', () => {
  it('上传后创建 pending 文档与任务，不在请求内解析/向量化', async () => {
    const { service, repository, embeddings, vectors, storage, queue } = setup()

    const result = await service.upload(auth, {
      title: '差旅费用报销标准',
      category: 'policy',
      tags: '报销,差旅',
      fileName: '差旅费用报销标准.md',
      data: Buffer.from('足够长的测试文档内容，用于验证异步上传流程。'),
    })

    expect(result.id).toBe(documentRecord.publicId)
    expect(storage.save).toHaveBeenCalledWith(
      expect.stringMatching(/^1\/[0-9A-Z]{26}\/v1$/),
      expect.any(Buffer),
    )
    expect(repository.createPendingDocument).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        fileName: '差旅费用报销标准.md',
        fileType: 'txt',
        mimeType: 'text/markdown',
        checksum: expect.any(String),
      }),
    )
    expect(queue.enqueue).toHaveBeenCalledWith({
      tenantId: '1',
      documentId: '10',
      versionId: '20',
    })
    expect(embeddings.embed).not.toHaveBeenCalled()
    expect(vectors.upsert).not.toHaveBeenCalled()
  })

  it('队列不可用时标记 failed 并返回 503', async () => {
    const { service, repository, queue } = setup()
    vi.mocked(queue.enqueue).mockRejectedValueOnce(new Error('redis down'))

    await expect(
      service.upload(auth, {
        title: '测试',
        category: 'tech',
        fileName: '测试.txt',
        data: Buffer.from('这是一段足够长的测试文档内容，用于触发入队失败。'),
      }),
    ).rejects.toMatchObject({ status: 503 })

    expect(repository.markVersionFailed).toHaveBeenCalledWith(
      '1',
      '10',
      '20',
      '索引任务入队失败',
    )
  })

  it('拒绝不支持的文件类型与超大文件', async () => {
    const { service, repository, embeddings, vectors, storage, queue } = setup()
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
      queue,
      vectorSize: 4,
      maxUploadBytes: 10,
      searchLimit: 6,
      searchOverfetch: 1,
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

  it('重复内容返回 40912，且不落库', async () => {
    const { service, repository } = setup()
    vi.mocked(repository.findDuplicateContent).mockResolvedValueOnce({
      documentId: '10',
      publicId: documentRecord.publicId,
      title: documentRecord.title,
      versionNo: 1,
    })

    await expect(
      service.upload(auth, {
        title: '重复文件',
        category: 'policy',
        fileName: '重复.txt',
        data: Buffer.from('这是一段足够长的重复内容，用于触发 checksum 去重。'),
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.KNOWLEDGE_CONTENT_DUPLICATE,
      status: 409,
      details: {
        reason: 'duplicate_content',
        existing: { documentId: documentRecord.publicId, versionNo: 1 },
      },
    })
    expect(repository.createPendingDocument).not.toHaveBeenCalled()
  })

  it('同名文件返回 40911 候选，forceCreate 可强制新建', async () => {
    const { service, repository } = setup()
    vi.mocked(repository.findDocumentsByName).mockResolvedValue([
      {
        publicId: documentRecord.publicId,
        title: documentRecord.title,
        fileName: documentRecord.fileName,
        currentVersionNo: 1,
      },
    ])

    await expect(
      service.upload(auth, {
        title: '同名文件',
        category: 'policy',
        fileName: documentRecord.fileName,
        data: Buffer.from('这是一段足够长的同名文档内容，用于触发冲突提示。'),
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.KNOWLEDGE_NAME_CONFLICT,
      details: { reason: 'same_name' },
    })

    await service.upload(auth, {
      title: '同名文件',
      category: 'policy',
      fileName: documentRecord.fileName,
      forceCreate: true,
      data: Buffer.from('这是一段足够长的同名文档内容，用于触发冲突提示。'),
    })
    expect(repository.createPendingDocument).toHaveBeenCalled()
  })

  it('上传新版本创建 pending 版本并入队', async () => {
    const { service, repository, queue } = setup()

    await service.uploadVersion(auth, documentRecord.publicId, {
      fileName: '差旅费用报销标准-v2.md',
      data: Buffer.from('这是新版本的内容，住宿上限调整为一线城市 700 元。'),
    })

    expect(repository.createPendingVersion).toHaveBeenCalledWith(
      '1',
      '10',
      expect.objectContaining({
        fileName: '差旅费用报销标准-v2.md',
        fileType: 'txt',
      }),
    )
    expect(queue.enqueue).toHaveBeenCalledWith({
      tenantId: '1',
      documentId: '10',
      versionId: '21',
    })
    expect(repository.markVersionReady).not.toHaveBeenCalled()
  })

  it('状态接口返回文档、版本与任务进度', async () => {
    const { service, repository } = setup()

    const status = await service.status(auth, documentRecord.publicId)

    expect(repository.findEmbeddingJob).toHaveBeenCalledWith('1', '20')
    expect(status.document.id).toBe(documentRecord.publicId)
    expect(status.version).toMatchObject({
      versionNo: 1,
      status: 'failed',
      jobStage: 'failed',
      errorMessage: '解析失败',
    })
    expect(status.job).toMatchObject({
      status: 'failed',
      stage: 'failed',
      progress: 100,
      attemptCount: 1,
    })
  })

  it('回滚只切换当前版本，非创建者被拒绝', async () => {
    const { service, repository } = setup()

    await service.activateVersion(auth, documentRecord.publicId, 1)
    expect(repository.activateVersion).toHaveBeenCalledWith(
      '1',
      documentRecord.publicId,
      1,
    )

    await expect(
      service.activateVersion(
        { ...auth, employeeId: '9' },
        documentRecord.publicId,
        1,
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('失败版本重试只重新入队，不阻塞请求', async () => {
    const { service, repository, queue } = setup()
    vi.mocked(repository.findVersion)
      .mockResolvedValueOnce(versionRecord)
      .mockResolvedValueOnce({ ...versionRecord, status: 'pending' })

    const result = await service.reindexVersion(
      auth,
      documentRecord.publicId,
      1,
    )

    expect(repository.queueVersionForRetry).toHaveBeenCalledWith('1', '10', '20')
    expect(queue.enqueue).toHaveBeenCalledWith({
      tenantId: '1',
      documentId: '10',
      versionId: '20',
    })
    expect(result.status).toBe('pending')
  })

  it('非失败版本不允许重试', async () => {
    const { service, repository } = setup()
    vi.mocked(repository.findVersion).mockResolvedValueOnce({
      ...versionRecord,
      status: 'ready',
    })

    await expect(
      service.reindexVersion(auth, documentRecord.publicId, 1),
    ).rejects.toMatchObject({
      code: ErrorCode.KNOWLEDGE_VERSION_INVALID,
    })
  })

  it('删除文档时清理向量与各版本文件', async () => {
    const { service, repository, vectors, storage } = setup()

    await service.deleteDocument(auth, documentRecord.publicId)

    expect(vectors.deleteDocument).toHaveBeenCalledWith('1', 10)
    expect(repository.markEmbeddingRecordsDeleted).toHaveBeenCalledWith('1', '10')
    expect(repository.cancelEmbeddingJobs).toHaveBeenCalledWith('1', '10')
    expect(storage.remove).toHaveBeenCalledWith('1/doc/v1')
  })

  it('语义检索合并 Qdrant 命中与 MySQL 分块，并保留租户过滤', async () => {
    const { service, repository, vectors } = setup()

    const result = await service.search(auth, { q: '住宿费上限' })

    expect(vectors.search).toHaveBeenCalledWith([1, 0, 0, 0], '1', 6)
    expect(repository.loadChunksByIds).toHaveBeenCalledWith('1', ['1'])
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]).toMatchObject({
      documentId: documentRecord.publicId,
      title: documentRecord.title,
      chunkIndex: 0,
      score: 0.82,
      versionNo: 1,
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
