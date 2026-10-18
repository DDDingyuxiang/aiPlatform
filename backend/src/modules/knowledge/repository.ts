import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type {
  KnowledgeDocCategory,
  KnowledgeDocFileType,
  KnowledgeDocStatus,
} from '@aiplatform/contracts'
import { ulid } from 'ulid'
import type {
  EmbeddingRecordInput,
  KnowledgeChunkRecord,
  KnowledgeCreatedRecord,
  KnowledgeCreateRecord,
  KnowledgeDocumentRecord,
  KnowledgeFileRecord,
  KnowledgeRepository,
} from './types.js'

interface DocumentRow extends RowDataPacket {
  id: string
  public_id: string
  knowledge_base_id: string
  title: string
  status: string
  updated_at: Date | string
  category: string
  tags_json: unknown
  summary: string | null
  file_name: string
  file_type: string
  size_bytes: string | number
  owner_public_id: string
  owner_name: string
  owner_department: string | null
}

interface ChunkRow extends RowDataPacket {
  id: string
  chunk_index: number
  content: string
  document_public_id: string
  title: string
  category: string
  file_type: string
  updated_at: Date | string
}

interface FileRow extends RowDataPacket {
  storage_key: string
  file_name: string
  mime_type: string
  size_bytes: string | number
}

interface IdRow extends RowDataPacket {
  id: string
  public_id?: string
}

const CATEGORIES = new Set(['policy', 'product', 'tech', 'market', 'training'])
const FILE_TYPES = new Set(['pdf', 'doc', 'xls', 'ppt', 'img', 'txt'])
const STATUSES = new Set(['pending', 'processing', 'ready', 'failed'])

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').slice(0, 20)
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string').slice(0, 20)
      }
    } catch {
      return []
    }
  }
  return []
}

function toCategory(value: string): KnowledgeDocCategory {
  return CATEGORIES.has(value) ? (value as KnowledgeDocCategory) : 'policy'
}

function toFileType(value: string): KnowledgeDocFileType {
  return FILE_TYPES.has(value) ? (value as KnowledgeDocFileType) : 'txt'
}

function toStatus(value: string): KnowledgeDocStatus {
  return STATUSES.has(value) ? (value as KnowledgeDocStatus) : 'failed'
}

function toDocument(row: DocumentRow): KnowledgeDocumentRecord {
  return {
    documentId: String(row.id),
    publicId: row.public_id,
    knowledgeBaseId: String(row.knowledge_base_id),
    title: row.title,
    category: toCategory(row.category),
    fileType: toFileType(row.file_type),
    status: toStatus(row.status),
    sizeBytes: Number(row.size_bytes ?? 0),
    updatedAt: toIso(row.updated_at),
    tags: parseTags(row.tags_json),
    summary: row.summary ?? '',
    fileName: row.file_name,
    owner: {
      publicId: row.owner_public_id,
      name: row.owner_name,
      department: row.owner_department ?? '',
    },
  }
}

const DOCUMENT_SELECT = `
SELECT d.id,
       d.public_id,
       d.knowledge_base_id,
       d.title,
       d.status,
       d.updated_at,
       m.category,
       m.tags_json,
       m.summary,
       m.file_name,
       m.file_type,
       v.size_bytes,
       e.public_id AS owner_public_id,
       e.display_name AS owner_name,
       (SELECT dept.name
          FROM employee_department_memberships edm
          JOIN departments dept
            ON dept.tenant_id = edm.tenant_id
           AND dept.id = edm.department_id
           AND dept.deleted_at IS NULL
         WHERE edm.tenant_id = d.tenant_id
           AND edm.employee_id = d.created_by
           AND edm.is_primary = 1
         LIMIT 1) AS owner_department
  FROM documents d
  JOIN document_metadata m
    ON m.tenant_id = d.tenant_id
   AND m.document_id = d.id
  JOIN employees e
    ON e.tenant_id = d.tenant_id
   AND e.id = d.created_by
  LEFT JOIN document_versions v
    ON v.tenant_id = d.tenant_id
   AND v.document_id = d.id
   AND v.version_no = (
     SELECT MAX(v2.version_no)
       FROM document_versions v2
      WHERE v2.tenant_id = d.tenant_id
        AND v2.document_id = d.id
   )
 WHERE d.tenant_id = ?
   AND d.deleted_at IS NULL`

/** MySQL 知识库仓储；权限与租户边界由服务层传入的 tenant_id 强制约束。 */
export function createMySqlKnowledgeRepository(pool: Pool): KnowledgeRepository {
  async function ensureKnowledgeBase(
    tenantId: string,
    employeeId: string,
  ): Promise<{ id: string; publicId: string }> {
    const [existing] = await pool.execute<IdRow[]>(
      `SELECT id, public_id
         FROM knowledge_bases
        WHERE tenant_id = ?
          AND status = 'active'
          AND deleted_at IS NULL
        ORDER BY id
        LIMIT 1`,
      [tenantId],
    )
    const row = existing.at(0)
    if (row?.public_id) return { id: String(row.id), publicId: row.public_id }

    const publicId = ulid()
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO knowledge_bases
         (tenant_id, public_id, name, description, status, created_by)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [tenantId, publicId, '企业知识库', '企业内部文档与资料', employeeId],
    )
    return { id: String(result.insertId), publicId }
  }

  async function insertEmbeddingRecords(
    connection: PoolConnection,
    tenantId: string,
    records: EmbeddingRecordInput[],
  ): Promise<void> {
    if (records.length === 0) return
    const placeholders = records
      .map(() => "(?, ?, 'qdrant', ?, ?, ?, 'indexed')")
      .join(', ')
    const params: string[] = []
    for (const record of records) {
      params.push(
        tenantId,
        record.chunkId,
        record.collectionName,
        record.pointId,
        record.embeddingProfileId,
      )
    }
    // 列顺序：tenant_id, chunk_id, vector_store, collection_name, point_id,
    // embedding_profile_id, status
    await connection.execute(
      `INSERT INTO embedding_records
         (tenant_id, chunk_id, vector_store, collection_name, point_id,
          embedding_profile_id, status)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE status = 'indexed', updated_at = UTC_TIMESTAMP(3)`,
      params,
    )
  }

  return {
    async listDocuments(tenantId) {
      const [rows] = await pool.execute<DocumentRow[]>(
        `${DOCUMENT_SELECT}
          ORDER BY d.updated_at DESC, d.id DESC`,
        [tenantId],
      )
      return rows.map(toDocument)
    },

    async findDocument(tenantId, publicId) {
      const [rows] = await pool.execute<DocumentRow[]>(
        `${DOCUMENT_SELECT}
            AND d.public_id = ?
          LIMIT 1`,
        [tenantId, publicId],
      )
      const row = rows.at(0)
      return row ? toDocument(row) : null
    },

    ensureDefaultKnowledgeBase: ensureKnowledgeBase,

    async ensureEmbeddingProfile(input) {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO embedding_profiles
           (provider, model_name, dimension, distance_metric, version)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [
          input.provider,
          input.modelName,
          input.dimension,
          input.distanceMetric,
          input.version,
        ],
      )
      return String(result.insertId)
    },

    async createDocument(tenantId, record: KnowledgeCreateRecord) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()

        const [documentResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO documents
             (tenant_id, public_id, knowledge_base_id, title, source_type,
              status, created_by)
           VALUES (?, ?, ?, ?, 'upload', 'processing', ?)`,
          [tenantId, record.publicId, record.knowledgeBaseId, record.title, record.createdBy],
        )
        const documentId = String(documentResult.insertId)

        const [versionResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO document_versions
             (tenant_id, document_id, version_no, storage_key, checksum,
              mime_type, size_bytes, status)
           VALUES (?, ?, 1, ?, ?, ?, ?, 'processing')`,
          [
            tenantId,
            documentId,
            record.storageKey,
            record.checksum,
            record.mimeType,
            record.sizeBytes,
          ],
        )
        const versionId = String(versionResult.insertId)

        await connection.execute(
          `INSERT INTO document_metadata
             (tenant_id, document_id, category, tags_json, summary,
              file_name, file_type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            documentId,
            record.category,
            JSON.stringify(record.tags),
            record.summary,
            record.fileName,
            record.fileType,
          ],
        )

        const chunkPlaceholders = record.chunks
          .map(() => '(?, ?, ?, ?, ?)')
          .join(', ')
        const chunkParams: Array<string | number> = []
        record.chunks.forEach((chunk, index) => {
          chunkParams.push(tenantId, documentId, versionId, index, chunk.content)
        })
        await connection.execute(
          `INSERT INTO document_chunks
             (tenant_id, document_id, document_version_id, chunk_index, content)
           VALUES ${chunkPlaceholders}`,
          chunkParams,
        )

        const [chunkRows] = await connection.execute<IdRow[]>(
          `SELECT id
             FROM document_chunks
            WHERE tenant_id = ?
              AND document_id = ?
              AND document_version_id = ?
            ORDER BY chunk_index`,
          [tenantId, documentId, versionId],
        )

        await connection.execute(
          `INSERT INTO embedding_jobs
             (tenant_id, document_id, document_version_id, status,
              attempt_count, started_at)
           VALUES (?, ?, ?, 'running', 1, UTC_TIMESTAMP(3))`,
          [tenantId, documentId, versionId],
        )

        await connection.commit()
        return {
          documentId,
          versionId,
          chunkIds: chunkRows.map((row) => String(row.id)),
        }
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async markDocumentReady(tenantId, documentId, versionId, records) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await insertEmbeddingRecords(connection, tenantId, records)
        await connection.execute(
          `UPDATE documents
              SET status = 'ready', updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND id = ?`,
          [tenantId, documentId],
        )
        await connection.execute(
          `UPDATE document_versions
              SET status = 'ready', updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND id = ?`,
          [tenantId, versionId],
        )
        await connection.execute(
          `UPDATE embedding_jobs
              SET status = 'succeeded', finished_at = UTC_TIMESTAMP(3),
                  error_message = NULL, updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND document_version_id = ? AND status = 'running'`,
          [tenantId, versionId],
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async markDocumentFailed(tenantId, documentId, versionId, message) {
      const safeMessage = message.slice(0, 2_000)
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute(
          `UPDATE documents
              SET status = 'failed', updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND id = ?`,
          [tenantId, documentId],
        )
        await connection.execute(
          `UPDATE document_versions
              SET status = 'failed', updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND id = ?`,
          [tenantId, versionId],
        )
        await connection.execute(
          `UPDATE embedding_jobs
              SET status = 'failed', finished_at = UTC_TIMESTAMP(3),
                  error_message = ?, updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND document_version_id = ? AND status = 'running'`,
          [safeMessage, tenantId, versionId],
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async loadChunksByIds(tenantId, chunkIds) {
      if (chunkIds.length === 0) return []
      const placeholders = chunkIds.map(() => '?').join(', ')
      const [rows] = await pool.execute<ChunkRow[]>(
        `SELECT c.id,
                c.chunk_index,
                c.content,
                d.public_id AS document_public_id,
                d.updated_at,
                d.title,
                m.category,
                m.file_type
           FROM document_chunks c
           JOIN documents d
             ON d.tenant_id = c.tenant_id
            AND d.id = c.document_id
            AND d.status = 'ready'
            AND d.deleted_at IS NULL
           JOIN document_metadata m
             ON m.tenant_id = c.tenant_id
            AND m.document_id = c.document_id
           JOIN knowledge_bases kb
             ON kb.tenant_id = d.tenant_id
            AND kb.id = d.knowledge_base_id
            AND kb.status = 'active'
            AND kb.deleted_at IS NULL
          WHERE c.tenant_id = ?
            AND c.id IN (${placeholders})`,
        [tenantId, ...chunkIds],
      )
      return rows.map<KnowledgeChunkRecord>((row) => ({
        chunkId: String(row.id),
        chunkIndex: Number(row.chunk_index),
        content: row.content,
        documentPublicId: row.document_public_id,
        title: row.title,
        category: toCategory(row.category),
        fileType: toFileType(row.file_type),
        updatedAt: toIso(row.updated_at),
      }))
    },

    async findDocumentFile(tenantId, publicId) {
      const [rows] = await pool.execute<FileRow[]>(
        `SELECT v.storage_key, m.file_name, v.mime_type, v.size_bytes
           FROM documents d
           JOIN document_metadata m
             ON m.tenant_id = d.tenant_id
            AND m.document_id = d.id
           JOIN document_versions v
             ON v.tenant_id = d.tenant_id
            AND v.document_id = d.id
            AND v.version_no = (
              SELECT MAX(v2.version_no)
                FROM document_versions v2
               WHERE v2.tenant_id = d.tenant_id
                 AND v2.document_id = d.id
            )
          WHERE d.tenant_id = ?
            AND d.public_id = ?
            AND d.status = 'ready'
            AND d.deleted_at IS NULL
          LIMIT 1`,
        [tenantId, publicId],
      )
      const row = rows.at(0)
      if (!row) return null
      return {
        storageKey: row.storage_key,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: Number(row.size_bytes),
      } satisfies KnowledgeFileRecord
    },
  }
}
