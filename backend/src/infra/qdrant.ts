import type { Logger } from '../shared/logger.js'

export interface QdrantConfig {
  url: string
  apiKey?: string
  collection: string
  vectorSize: number
}

export interface VectorPoint {
  /** 使用 document_chunks.id（Qdrant 支持无符号整数 ID） */
  id: number
  vector: number[]
  payload: Record<string, number>
}

export interface VectorSearchHit {
  id: number
  score: number
  payload: Record<string, unknown>
}

export interface VectorStore {
  /** 幂等创建 collection 与 payload 索引 */
  ensureCollection(): Promise<void>
  upsert(points: VectorPoint[]): Promise<void>
  search(vector: number[], tenantId: string, limit: number): Promise<VectorSearchHit[]>
  deleteDocument(tenantId: string, documentId: number): Promise<void>
  deleteVersion(tenantId: string, documentVersionId: number): Promise<void>
}

interface QdrantResponse<T> {
  result?: T
  status?: string
}

const REQUEST_TIMEOUT_MS = 15_000

/** Qdrant REST 适配器；业务层只依赖 VectorStore 接口。 */
export function createQdrantVectorStore(
  config: QdrantConfig,
  logger?: Logger,
): VectorStore {
  const baseUrl = `${config.url}/collections/${encodeURIComponent(config.collection)}`
  let collectionReady: Promise<void> | null = null

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: QdrantResponse<T> | null }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(config.apiKey ? { 'api-key': config.apiKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
      const data = (await response.json().catch(() => null)) as QdrantResponse<T> | null
      return { status: response.status, data }
    } finally {
      clearTimeout(timer)
    }
  }

  async function ensureCollection(): Promise<void> {
    if (collectionReady) return collectionReady
    collectionReady = (async () => {
      const existing = await request('GET', '')
      if (existing.status === 404) {
        const created = await request('PUT', '', {
          vectors: { size: config.vectorSize, distance: 'Cosine' },
        })
        if (created.status >= 300) {
          throw new Error(`创建 Qdrant collection 失败（HTTP ${created.status}）`)
        }
        logger?.info('qdrant.collection_created', {
          collection: config.collection,
          vectorSize: config.vectorSize,
        })
      } else if (existing.status >= 300) {
        throw new Error(`检查 Qdrant collection 失败（HTTP ${existing.status}）`)
      }

      // 索引接口幂等；失败不阻塞检索（小数据量下可全量扫描）
      for (const field of [
        'tenant_id',
        'knowledge_base_id',
        'document_id',
        'document_version_id',
        'chunk_id',
      ]) {
        await request('PUT', '/index', {
          field_name: field,
          field_schema: 'integer',
        }).catch((error: unknown) => {
          logger?.warn('qdrant.index_create_failed', {
            field,
            error: error instanceof Error ? error.message : String(error),
          })
        })
      }
    })().catch((error) => {
      // 失败后允许下次请求重试
      collectionReady = null
      throw error
    })
    return collectionReady
  }

  return {
    ensureCollection,

    async upsert(points) {
      await ensureCollection()
      if (points.length === 0) return
      const response = await request('PUT', '/points?wait=true', { points })
      if (response.status >= 300) {
        throw new Error(`写入 Qdrant 失败（HTTP ${response.status}）`)
      }
    },

    async search(vector, tenantId, limit) {
      await ensureCollection()
      const response = await request<VectorSearchHit[]>(
        'POST',
        '/points/search',
        {
          vector,
          limit,
          with_payload: true,
          filter: {
            must: [{ key: 'tenant_id', match: { value: Number(tenantId) } }],
          },
        },
      )
      if (response.status >= 300) {
        throw new Error(`Qdrant 检索失败（HTTP ${response.status}）`)
      }
      return Array.isArray(response.data?.result) ? response.data.result : []
    },

    async deleteDocument(tenantId, documentId) {
      await ensureCollection()
      const response = await request('POST', '/points/delete?wait=true', {
        filter: {
          must: [
            { key: 'tenant_id', match: { value: Number(tenantId) } },
            { key: 'document_id', match: { value: documentId } },
          ],
        },
      })
      if (response.status >= 300) {
        throw new Error(`删除 Qdrant 向量失败（HTTP ${response.status}）`)
      }
    },

    async deleteVersion(tenantId, documentVersionId) {
      await ensureCollection()
      const response = await request('POST', '/points/delete?wait=true', {
        filter: {
          must: [
            { key: 'tenant_id', match: { value: Number(tenantId) } },
            {
              key: 'document_version_id',
              match: { value: documentVersionId },
            },
          ],
        },
      })
      if (response.status >= 300) {
        throw new Error(`删除版本向量失败（HTTP ${response.status}）`)
      }
    },
  }
}
