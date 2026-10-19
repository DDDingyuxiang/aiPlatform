import { describe, expect, it, vi } from 'vitest'
import type { LocalFileStorage } from '../../../infra/local-storage.js'
import type { VectorStore } from '../../../infra/qdrant.js'
import type { EmbeddingService } from '../../ai/index.js'
import { createKnowledgeIndexer } from '../indexer.js'
import type {
  KnowledgeIndexTarget,
  KnowledgeRepository,
} from '../types.js'

const target: KnowledgeIndexTarget = {
  documentId: '10',
  publicId: '01KDOC0000000000000000001',
  knowledgeBaseId: '1',
  deleted: false,
  versionId: '20',
  versionNo: 1,
  versionStatus: 'pending',
  storageKey: '1/doc/v1',
  fileName: 'test.txt',
  fileType: 'txt',
  mimeType: 'text/plain',
}

function setup(overrides: Partial<KnowledgeRepository> = {}) {
  const repository = {
    findIndexTarget: vi.fn(async () => target),
    startEmbeddingJob: vi.fn(async () => true),
    updateEmbeddingJobProgress: vi.fn(async () => {}),
    updateVersionParsedInfo: vi.fn(async () => {}),
    replaceVersionChunks: vi.fn(async () => ['101']),
    ensureEmbeddingProfile: vi.fn(async () => '7'),
    markVersionReady: vi.fn(async () => {}),
    markVersionFailed: vi.fn(async () => {}),
    markJobSucceeded: vi.fn(async () => {}),
    findVersion: vi.fn(async () => ({
      versionId: '20',
      versionNo: 1,
      status: 'ready',
      fileName: 'test.txt',
      fileType: 'txt',
      mimeType: 'text/plain',
      sizeBytes: 100,
      checksum: 'x',
      storageKey: '1/doc/v1',
      createdAt: '2026-10-19T00:00:00.000Z',
      isCurrent: true,
    })),
    ...overrides,
  } as unknown as KnowledgeRepository

  const storage: LocalFileStorage = {
    save: vi.fn(async () => {}),
    read: vi.fn(async () =>
      Buffer.from('这是足够长的知识库测试文档内容，用于验证 Worker 解析与索引流程。'),
    ),
    open: vi.fn(async () => {
      throw new Error('not used')
    }),
    remove: vi.fn(async () => {}),
  }

  const embeddings: EmbeddingService = {
    embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0, 0])),
  }

  const vectors: VectorStore = {
    ensureCollection: vi.fn(async () => {}),
    upsert: vi.fn(async () => {}),
    search: vi.fn(async () => []),
    deleteDocument: vi.fn(async () => {}),
    deleteVersion: vi.fn(async () => {}),
  }

  const indexer = createKnowledgeIndexer({
    repository,
    storage,
    embeddings,
    vectors,
    collectionName: 'document_chunks',
    vectorSize: 4,
    chunkSize: 350,
    chunkOverlap: 60,
  })

  return { indexer, repository, storage, embeddings, vectors }
}

describe('knowledge indexer', () => {
  it('解析、分块、向量化并标记 ready', async () => {
    const { indexer, repository, embeddings, vectors } = setup()

    await indexer.process({ tenantId: '1', documentId: '10', versionId: '20' })

    expect(repository.startEmbeddingJob).toHaveBeenCalledWith('1', '20')
    expect(repository.updateEmbeddingJobProgress).toHaveBeenCalledWith(
      '1',
      '20',
      'parsing',
      10,
    )
    expect(repository.updateVersionParsedInfo).toHaveBeenCalledWith('1', '20', {
      fileType: 'txt',
      mimeType: 'text/plain',
    })
    expect(repository.replaceVersionChunks).toHaveBeenCalled()
    expect(embeddings.embed).toHaveBeenCalled()
    expect(vectors.deleteVersion).toHaveBeenCalledWith('1', 20)
    expect(vectors.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 101,
          payload: expect.objectContaining({
            tenant_id: 1,
            knowledge_base_id: 1,
            document_id: 10,
            document_version_id: 20,
            chunk_id: 101,
          }),
        }),
      ]),
    )
    expect(repository.markVersionReady).toHaveBeenCalledWith(
      '1',
      '10',
      '20',
      [expect.objectContaining({ chunkId: '101', pointId: '101' })],
    )
    expect(repository.markVersionFailed).not.toHaveBeenCalled()
  })

  it('解析失败时记录错误并标记 failed', async () => {
    const { indexer, repository, storage } = setup()
    vi.mocked(storage.read).mockResolvedValueOnce(Buffer.from('短'))

    await expect(
      indexer.process({ tenantId: '1', documentId: '10', versionId: '20' }),
    ).rejects.toThrow()

    expect(repository.markVersionFailed).toHaveBeenCalledWith(
      '1',
      '10',
      '20',
      expect.stringContaining('未提取到可用文本'),
    )
  })

  it('向量写入失败时标记 failed', async () => {
    const { indexer, repository, vectors } = setup()
    vi.mocked(vectors.upsert).mockRejectedValueOnce(new Error('qdrant down'))

    await expect(
      indexer.process({ tenantId: '1', documentId: '10', versionId: '20' }),
    ).rejects.toThrow('qdrant down')

    expect(repository.markVersionFailed).toHaveBeenCalledWith(
      '1',
      '10',
      '20',
      'qdrant down',
    )
  })

  it('版本已就绪时收敛重复任务，不再重复处理', async () => {
    const { indexer, repository } = setup({
      findIndexTarget: vi.fn(async () => ({
        ...target,
        versionStatus: 'ready',
      })),
    })

    await indexer.process({ tenantId: '1', documentId: '10', versionId: '20' })

    expect(repository.markJobSucceeded).toHaveBeenCalledWith('1', '20')
    expect(repository.startEmbeddingJob).not.toHaveBeenCalled()
  })

  it('文档已删除时不执行索引', async () => {
    const { indexer, repository } = setup({
      findIndexTarget: vi.fn(async () => ({ ...target, deleted: true })),
    })

    await indexer.process({ tenantId: '1', documentId: '10', versionId: '20' })

    expect(repository.markVersionFailed).toHaveBeenCalledWith(
      '1',
      '10',
      '20',
      '文档已删除',
    )
  })
})
