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
  KnowledgeDeleteRecord,
  KnowledgeDocumentRecord,
  KnowledgeDuplicateRecord,
  KnowledgeFileRecord,
  KnowledgeIndexTarget,
  KnowledgeJobRecord,
  KnowledgeJobRef,
  KnowledgeNameCandidateRecord,
  KnowledgePendingCreateRecord,
  KnowledgePendingCreatedRecord,
  KnowledgePendingVersionInput,
  KnowledgePendingVersionRecord,
  KnowledgeRepository,
  KnowledgeVersionRecord,
} from './types.js'

interface DocumentRow extends RowDataPacket {
  id: string
  public_id: string
  knowledge_base_id: string
  title: string
  status: string
  updated_at: Date | string
  created_by: string
  current_version_id: string | null
  current_version_no: number | null
  version_count: number | string
  category: string
  tags_json: unknown
  summary: string | null
  file_name: string
  file_type: string
  size_bytes: string | number | null
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
  version_no: number
}

interface FileRow extends RowDataPacket {
  storage_key: string
  file_name: string
  mime_type: string
  size_bytes: string | number
  version_no: number
}

interface VersionRow extends RowDataPacket {
  id: string
  version_no: number
  status: string
  file_name: string | null
  file_type: string | null
  mime_type: string
  size_bytes: string | number
  checksum: string
  storage_key: string
  created_at: Date | string
  is_current: number | string | null
  job_stage: string | null
  job_progress: number | string | null
  job_error: string | null
}

interface JobRow extends RowDataPacket {
  status: string
  stage: string | null
  progress: number | string
  attempt_count: number | string
  error_message: string | null
  started_at: Date | string | null
  finished_at: Date | string | null
}

interface IndexTargetRow extends RowDataPacket {
  document_id: string
  public_id: string
  knowledge_base_id: string
  deleted_at: Date | string | null
  version_id: string
  version_no: number
  version_status: string
  storage_key: string
  file_name: string | null
  file_type: string | null
  mime_type: string
}

interface PendingJobRow extends RowDataPacket {
  tenant_id: string
  document_id: string
  document_version_id: string
}

interface DuplicateRow extends RowDataPacket {
  id: string
  public_id: string
  title: string
  version_no: number
}

interface NameCandidateRow extends RowDataPacket {
  public_id: string
  title: string
  file_name: string
  current_version_no: number | null
}

interface StorageKeyRow extends RowDataPacket {
  storage_key: string
}

interface IdRow extends RowDataPacket {
  id: string
  public_id?: string
}

interface VersionLockRow extends RowDataPacket {
  id: string
  current_version_id: string | null
  current_version_no: number | null
}

interface VersionMetaRow extends RowDataPacket {
  id: string
  version_no: number
  file_name: string | null
  file_type: string | null
}

const CATEGORIES = new Set(['policy', 'product', 'tech', 'market', 'training'])
const FILE_TYPES = new Set(['pdf', 'doc', 'xls', 'ppt', 'img', 'txt'])
const STATUSES = new Set(['pending', 'processing', 'ready', 'failed'])
const JOB_STATUSES = new Set([
  'pending',
  'running',
  'succeeded',
  'failed',
  'canceled',
])
const JOB_STAGES = new Set([
  'queued',
  'parsing',
  'chunking',
  'embedding',
  'indexing',
  'completed',
  'failed',
])

function toJobStatus(value: string): KnowledgeJobRecord['status'] {
  return JOB_STATUSES.has(value)
    ? (value as KnowledgeJobRecord['status'])
    : 'failed'
}

function toJobStage(value: string | null): KnowledgeJobRecord['stage'] {
  return value && JOB_STAGES.has(value)
    ? (value as KnowledgeJobRecord['stage'])
    : null
}

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

function toFileType(value: string | null): KnowledgeDocFileType {
  return value && FILE_TYPES.has(value) ? (value as KnowledgeDocFileType) : 'txt'
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
    createdBy: String(row.created_by),
    currentVersionId:
      row.current_version_id === null ? null : String(row.current_version_id),
    currentVersionNo:
      row.current_version_no === null ? null : Number(row.current_version_no),
    versionCount: Number(row.version_count ?? 0),
    owner: {
      publicId: row.owner_public_id,
      name: row.owner_name,
      department: row.owner_department ?? '',
    },
  }
}

function toVersion(row: VersionRow): KnowledgeVersionRecord {
  return {
    versionId: String(row.id),
    versionNo: Number(row.version_no),
    status: toStatus(row.status),
    fileName: row.file_name ?? '',
    fileType: toFileType(row.file_type),
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes ?? 0),
    checksum: row.checksum,
    storageKey: row.storage_key,
    createdAt: toIso(row.created_at),
    isCurrent: Boolean(Number(row.is_current ?? 0)),
    ...(row.job_stage
      ? { jobStage: row.job_stage as KnowledgeVersionRecord['jobStage'] }
      : {}),
    ...(row.job_progress === null
      ? {}
      : { jobProgress: Number(row.job_progress) }),
    ...(row.job_error === null ? {} : { errorMessage: row.job_error }),
  }
}

const DOCUMENT_SELECT = `
SELECT d.id,
       d.public_id,
       d.knowledge_base_id,
       d.title,
       d.status,
       d.updated_at,
       d.created_by,
       d.current_version_id,
       v.version_no AS current_version_no,
       (SELECT COUNT(*)
          FROM document_versions dv
         WHERE dv.tenant_id = d.tenant_id
           AND dv.document_id = d.id) AS version_count,
       m.category,
       m.tags_json,
       m.summary,
       m.file_name,
       m.file_type,
       COALESCE(v.size_bytes, lv.size_bytes, 0) AS size_bytes,
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
   AND v.id = d.current_version_id
  LEFT JOIN document_versions lv
    ON lv.tenant_id = d.tenant_id
   AND lv.id = (SELECT dv.id
                  FROM document_versions dv
                 WHERE dv.tenant_id = d.tenant_id
                   AND dv.document_id = d.id
                 ORDER BY dv.version_no DESC
                 LIMIT 1)
 WHERE d.tenant_id = ?
   AND d.deleted_at IS NULL`

const VERSION_SELECT = `
SELECT v.id,
       v.version_no,
       v.status,
       v.file_name,
       v.file_type,
       v.mime_type,
       v.size_bytes,
       v.checksum,
       v.storage_key,
       v.created_at,
       (v.id = d.current_version_id) AS is_current,
       j.stage AS job_stage,
       j.progress AS job_progress,
       j.error_message AS job_error
  FROM document_versions v
  JOIN documents d
    ON d.tenant_id = v.tenant_id
   AND d.id = v.document_id
   AND d.deleted_at IS NULL
  JOIN document_metadata m
    ON m.tenant_id = d.tenant_id
   AND m.document_id = d.id
  LEFT JOIN embedding_jobs j
    ON j.id = (
      SELECT j2.id
        FROM embedding_jobs j2
       WHERE j2.tenant_id = v.tenant_id
         AND j2.document_version_id = v.id
       ORDER BY j2.id DESC
       LIMIT 1
    )
 WHERE v.tenant_id = ?`

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

  async function insertPendingVersion(
    connection: PoolConnection,
    tenantId: string,
    documentId: string,
    versionNo: number,
    record: KnowledgePendingVersionInput,
  ): Promise<string> {
    const [versionResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_versions
         (tenant_id, document_id, version_no, storage_key, checksum,
          mime_type, size_bytes, file_name, file_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        tenantId,
        documentId,
        versionNo,
        record.storageKey,
        record.checksum,
        record.mimeType,
        record.sizeBytes,
        record.fileName,
        record.fileType,
      ],
    )
    const versionId = String(versionResult.insertId)
    await connection.execute(
      `INSERT INTO embedding_jobs
         (tenant_id, document_id, document_version_id, status, stage,
          progress, attempt_count)
       VALUES (?, ?, ?, 'pending', 'queued', 0, 0)`,
      [tenantId, documentId, versionId],
    )
    return versionId
  }

  async function lockDocument(
    connection: PoolConnection,
    tenantId: string,
    documentId: string,
  ): Promise<VersionLockRow | null> {
    const [rows] = await connection.execute<VersionLockRow[]>(
      `SELECT d.id,
              d.current_version_id,
              v.version_no AS current_version_no
         FROM documents d
         LEFT JOIN document_versions v
           ON v.tenant_id = d.tenant_id
          AND v.id = d.current_version_id
        WHERE d.tenant_id = ?
          AND d.id = ?
          AND d.deleted_at IS NULL
        FOR UPDATE`,
      [tenantId, documentId],
    )
    return rows.at(0) ?? null
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

    async findDuplicateContent(tenantId, knowledgeBaseId, checksum, excludeDocumentId) {
      const params: Array<string | number> = [tenantId, knowledgeBaseId, checksum]
      let exclude = ''
      if (excludeDocumentId) {
        exclude = 'AND d.id <> ?'
        params.push(excludeDocumentId)
      }
      const [rows] = await pool.execute<DuplicateRow[]>(
        `SELECT d.id,
                d.public_id,
                d.title,
                v.version_no
           FROM document_versions v
           JOIN documents d
             ON d.tenant_id = v.tenant_id
            AND d.id = v.document_id
            AND d.deleted_at IS NULL
          WHERE v.tenant_id = ?
            AND d.knowledge_base_id = ?
            AND v.checksum = ?
            AND v.status = 'ready'
            ${exclude}
          ORDER BY v.created_at DESC, v.id DESC
          LIMIT 1`,
        params,
      )
      const row = rows.at(0)
      if (!row) return null
      return {
        documentId: String(row.id),
        publicId: row.public_id,
        title: row.title,
        versionNo: Number(row.version_no),
      } satisfies KnowledgeDuplicateRecord
    },

    async findDocumentsByName(tenantId, knowledgeBaseId, fileName, excludeDocumentId) {
      const params: Array<string | number> = [tenantId, knowledgeBaseId, fileName]
      let exclude = ''
      if (excludeDocumentId) {
        exclude = 'AND d.id <> ?'
        params.push(excludeDocumentId)
      }
      const [rows] = await pool.execute<NameCandidateRow[]>(
        `SELECT d.public_id,
                d.title,
                m.file_name,
                v.version_no AS current_version_no
           FROM documents d
           JOIN document_metadata m
             ON m.tenant_id = d.tenant_id
            AND m.document_id = d.id
           LEFT JOIN document_versions v
             ON v.tenant_id = d.tenant_id
            AND v.id = d.current_version_id
          WHERE d.tenant_id = ?
            AND d.knowledge_base_id = ?
            AND m.file_name = ?
            AND d.deleted_at IS NULL
            ${exclude}
          ORDER BY d.updated_at DESC, d.id DESC
          LIMIT 10`,
        params,
      )
      return rows.map<KnowledgeNameCandidateRecord>((row) => ({
        publicId: row.public_id,
        title: row.title,
        fileName: row.file_name,
        currentVersionNo:
          row.current_version_no === null
            ? null
            : Number(row.current_version_no),
      }))
    },

    async createPendingDocument(tenantId, record: KnowledgePendingCreateRecord) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()

        const [documentResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO documents
             (tenant_id, public_id, knowledge_base_id, title, source_type,
              status, created_by)
           VALUES (?, ?, ?, ?, 'upload', 'pending', ?)`,
          [
            tenantId,
            record.publicId,
            record.knowledgeBaseId,
            record.title,
            record.createdBy,
          ],
        )
        const documentId = String(documentResult.insertId)

        await connection.execute(
          `INSERT INTO document_metadata
             (tenant_id, document_id, category, tags_json, summary,
              file_name, file_type)
           VALUES (?, ?, ?, ?, '', ?, ?)`,
          [
            tenantId,
            documentId,
            record.category,
            JSON.stringify(record.tags),
            record.fileName,
            record.fileType,
          ],
        )

        const versionId = await insertPendingVersion(
          connection,
          tenantId,
          documentId,
          1,
          record,
        )

        await connection.commit()
        return {
          documentId,
          versionId,
        } satisfies KnowledgePendingCreatedRecord
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async createPendingVersion(tenantId, documentId, record) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const locked = await lockDocument(connection, tenantId, documentId)
        if (!locked) throw new Error('文档不存在或已删除')

        const [maxRows] = await connection.execute<
          Array<RowDataPacket & { max_no: number | null }>
        >(
          `SELECT MAX(version_no) AS max_no
             FROM document_versions
            WHERE tenant_id = ? AND document_id = ?`,
          [tenantId, documentId],
        )
        const versionNo = Number(maxRows.at(0)?.max_no ?? 0) + 1
        const versionId = await insertPendingVersion(
          connection,
          tenantId,
          documentId,
          versionNo,
          record,
        )
        // 首个版本尚未就绪时文档展示为 pending；已有可用版本时保持 ready
        await connection.execute(
          `UPDATE documents
              SET status = 'pending', updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ?
              AND id = ?
              AND current_version_id IS NULL
              AND deleted_at IS NULL`,
          [tenantId, documentId],
        )
        await connection.commit()
        return {
          versionId,
          versionNo,
        } satisfies KnowledgePendingVersionRecord
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async replaceVersionChunks(tenantId, documentId, versionId, chunks) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()

        // 重试时先清理旧分块与对应的 embedding 记录，避免孤儿映射
        await connection.execute(
          `DELETE er
             FROM embedding_records er
             JOIN document_chunks c
               ON c.tenant_id = er.tenant_id
              AND c.id = er.chunk_id
            WHERE c.tenant_id = ?
              AND c.document_id = ?
              AND c.document_version_id = ?`,
          [tenantId, documentId, versionId],
        )
        await connection.execute(
          `DELETE FROM document_chunks
            WHERE tenant_id = ? AND document_id = ? AND document_version_id = ?`,
          [tenantId, documentId, versionId],
        )

        if (chunks.length > 0) {
          const placeholders = chunks.map(() => '(?, ?, ?, ?, ?)').join(', ')
          const params: Array<string | number> = []
          chunks.forEach((content, index) => {
            params.push(tenantId, documentId, versionId, index, content)
          })
          await connection.execute(
            `INSERT INTO document_chunks
               (tenant_id, document_id, document_version_id, chunk_index, content)
             VALUES ${placeholders}`,
            params,
          )
        }

        const [chunkRows] = await connection.execute<IdRow[]>(
          `SELECT id
             FROM document_chunks
            WHERE tenant_id = ?
              AND document_id = ?
              AND document_version_id = ?
            ORDER BY chunk_index`,
          [tenantId, documentId, versionId],
        )

        await connection.commit()
        return chunkRows.map((row) => String(row.id))
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async updateVersionParsedInfo(tenantId, versionId, input) {
      await pool.execute(
        `UPDATE document_versions
            SET file_type = ?,
                mime_type = ?,
                updated_at = UTC_TIMESTAMP(3)
          WHERE tenant_id = ? AND id = ?`,
        [input.fileType, input.mimeType, tenantId, versionId],
      )
    },

    async startEmbeddingJob(tenantId, versionId) {
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE embedding_jobs
            SET status = 'running',
                stage = 'parsing',
                progress = 5,
                attempt_count = attempt_count + 1,
                error_message = NULL,
                started_at = UTC_TIMESTAMP(3),
                finished_at = NULL,
                updated_at = UTC_TIMESTAMP(3)
          WHERE tenant_id = ?
            AND document_version_id = ?
            AND status = 'pending'`,
        [tenantId, versionId],
      )
      return result.affectedRows > 0
    },

    async updateEmbeddingJobProgress(tenantId, versionId, stage, progress) {
      await pool.execute(
        `UPDATE embedding_jobs
            SET stage = ?,
                progress = ?,
                updated_at = UTC_TIMESTAMP(3)
          WHERE tenant_id = ? AND document_version_id = ?`,
        [stage, progress, tenantId, versionId],
      )
    },

    async markJobSucceeded(tenantId, versionId) {
      await pool.execute(
        `UPDATE embedding_jobs
            SET status = 'succeeded',
                stage = 'completed',
                progress = 100,
                error_message = NULL,
                finished_at = UTC_TIMESTAMP(3),
                updated_at = UTC_TIMESTAMP(3)
          WHERE tenant_id = ?
            AND document_version_id = ?
            AND status IN ('pending', 'running')`,
        [tenantId, versionId],
      )
    },

    async queueVersionForRetry(tenantId, documentId, versionId) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute(
          `UPDATE embedding_jobs
              SET status = 'pending',
                  stage = 'queued',
                  progress = 0,
                  error_message = NULL,
                  finished_at = NULL,
                  updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND document_version_id = ?`,
          [tenantId, versionId],
        )
        await connection.execute(
          `UPDATE document_versions
              SET status = 'pending', updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND id = ?`,
          [tenantId, versionId],
        )
        await connection.execute(
          `UPDATE documents
              SET status = 'pending', updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ?
              AND id = ?
              AND current_version_id IS NULL
              AND deleted_at IS NULL`,
          [tenantId, documentId],
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async resetRunningJobs() {
      await pool.execute(
        `UPDATE embedding_jobs
            SET status = 'pending',
                stage = 'queued',
                progress = 0,
                error_message = NULL,
                started_at = NULL,
                finished_at = NULL,
                updated_at = UTC_TIMESTAMP(3)
          WHERE status = 'running'`,
      )
    },

    async listPendingJobs(limit) {
      const [rows] = await pool.execute<PendingJobRow[]>(
        `SELECT tenant_id, document_id, document_version_id
           FROM embedding_jobs
          WHERE status = 'pending'
          ORDER BY id
          LIMIT ?`,
        [limit],
      )
      return rows.map<KnowledgeJobRef>((row) => ({
        tenantId: String(row.tenant_id),
        documentId: String(row.document_id),
        versionId: String(row.document_version_id),
      }))
    },

    async findIndexTarget(tenantId, documentId, versionId) {
      const [rows] = await pool.execute<IndexTargetRow[]>(
        `SELECT d.id AS document_id,
                d.public_id,
                d.knowledge_base_id,
                d.deleted_at,
                v.id AS version_id,
                v.version_no,
                v.status AS version_status,
                v.storage_key,
                v.file_name,
                v.file_type,
                v.mime_type
           FROM documents d
           JOIN document_versions v
             ON v.tenant_id = d.tenant_id
            AND v.document_id = d.id
          WHERE d.tenant_id = ?
            AND d.id = ?
            AND v.id = ?
          LIMIT 1`,
        [tenantId, documentId, versionId],
      )
      const row = rows.at(0)
      if (!row) return null
      return {
        documentId: String(row.document_id),
        publicId: row.public_id,
        knowledgeBaseId: String(row.knowledge_base_id),
        deleted: row.deleted_at !== null,
        versionId: String(row.version_id),
        versionNo: Number(row.version_no),
        versionStatus: toStatus(row.version_status),
        storageKey: row.storage_key,
        fileName: row.file_name ?? '',
        fileType: toFileType(row.file_type),
        mimeType: row.mime_type,
      } satisfies KnowledgeIndexTarget
    },

    async findEmbeddingJob(tenantId, versionId) {
      const [rows] = await pool.execute<JobRow[]>(
        `SELECT status, stage, progress, attempt_count, error_message,
                started_at, finished_at
           FROM embedding_jobs
          WHERE tenant_id = ? AND document_version_id = ?
          ORDER BY id DESC
          LIMIT 1`,
        [tenantId, versionId],
      )
      const row = rows.at(0)
      if (!row) return null
      return {
        status: toJobStatus(row.status),
        stage: toJobStage(row.stage),
        progress: Number(row.progress ?? 0),
        attemptCount: Number(row.attempt_count ?? 0),
        errorMessage: row.error_message,
        startedAt:
          row.started_at === null ? null : toIso(row.started_at),
        finishedAt:
          row.finished_at === null ? null : toIso(row.finished_at),
      } satisfies KnowledgeJobRecord
    },

    async markVersionReady(tenantId, documentId, versionId, records) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await insertEmbeddingRecords(connection, tenantId, records)

        const [versionRows] = await connection.execute<VersionMetaRow[]>(
          `SELECT id, version_no, file_name, file_type
             FROM document_versions
            WHERE tenant_id = ? AND id = ?
            FOR UPDATE`,
          [tenantId, versionId],
        )
        const version = versionRows.at(0)
        if (!version) throw new Error('文档版本不存在')

        await connection.execute(
          `UPDATE document_versions
              SET status = 'ready', updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND id = ?`,
          [tenantId, versionId],
        )
        await connection.execute(
          `UPDATE embedding_jobs
              SET status = 'succeeded',
                  stage = 'completed',
                  progress = 100,
                  finished_at = UTC_TIMESTAMP(3),
                  error_message = NULL,
                  updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND document_version_id = ? AND status = 'running'`,
          [tenantId, versionId],
        )

        const locked = await lockDocument(connection, tenantId, documentId)
        if (!locked) throw new Error('文档不存在或已删除')

        const activeNo = locked.current_version_no
        const shouldActivate =
          activeNo === null || Number(version.version_no) > Number(activeNo)
        if (shouldActivate) {
          await connection.execute(
            `UPDATE documents
                SET status = 'ready',
                    current_version_id = ?,
                    updated_at = UTC_TIMESTAMP(3)
              WHERE tenant_id = ? AND id = ?`,
            [versionId, tenantId, documentId],
          )
          await connection.execute(
            `UPDATE document_metadata
                SET file_name = COALESCE(?, file_name),
                    file_type = COALESCE(?, file_type),
                    summary = '',
                    updated_at = UTC_TIMESTAMP(3)
              WHERE tenant_id = ? AND document_id = ?`,
            [
              version.file_name,
              version.file_type,
              tenantId,
              documentId,
            ],
          )
        } else {
          await connection.execute(
            `UPDATE documents
                SET status = 'ready', updated_at = UTC_TIMESTAMP(3)
              WHERE tenant_id = ? AND id = ?`,
            [tenantId, documentId],
          )
        }

        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async markVersionFailed(tenantId, documentId, versionId, message) {
      const safeMessage = message.slice(0, 2_000)
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.execute(
          `UPDATE document_versions
              SET status = 'failed', updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND id = ?`,
          [tenantId, versionId],
        )
        await connection.execute(
          `UPDATE embedding_jobs
              SET status = 'failed',
                  stage = 'failed',
                  progress = 100,
                  finished_at = UTC_TIMESTAMP(3),
                  error_message = ?,
                  updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ?
              AND document_version_id = ?
              AND status IN ('pending', 'running')`,
          [safeMessage, tenantId, versionId],
        )
        // 只有完全没有可用版本时才把文档标记为失败；新版本失败不应影响旧版本
        await connection.execute(
          `UPDATE documents
              SET status = 'failed', updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ?
              AND id = ?
              AND deleted_at IS NULL
              AND current_version_id IS NULL`,
          [tenantId, documentId],
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async listVersions(tenantId, publicId) {
      const [rows] = await pool.execute<VersionRow[]>(
        `${VERSION_SELECT}
            AND d.public_id = ?
          ORDER BY v.version_no DESC`,
        [tenantId, publicId],
      )
      return rows.map(toVersion)
    },

    async findVersion(tenantId, publicId, versionNo) {
      const [rows] = await pool.execute<VersionRow[]>(
        `${VERSION_SELECT}
            AND d.public_id = ?
            AND v.version_no = ?
          LIMIT 1`,
        [tenantId, publicId, versionNo],
      )
      const row = rows.at(0)
      return row ? toVersion(row) : null
    },

    async activateVersion(tenantId, publicId, versionNo) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [documentRows] = await connection.execute<IdRow[]>(
          `SELECT id
             FROM documents
            WHERE tenant_id = ? AND public_id = ? AND deleted_at IS NULL
            FOR UPDATE`,
          [tenantId, publicId],
        )
        const documentId = documentRows.at(0)?.id
        if (!documentId) {
          await connection.rollback()
          return false
        }
        const [versionRows] = await connection.execute<VersionMetaRow[]>(
          `SELECT id, version_no, file_name, file_type
             FROM document_versions
            WHERE tenant_id = ?
              AND document_id = ?
              AND version_no = ?
              AND status = 'ready'
            LIMIT 1`,
          [tenantId, documentId, versionNo],
        )
        const version = versionRows.at(0)
        if (!version) {
          await connection.rollback()
          return false
        }
        await connection.execute(
          `UPDATE documents
              SET current_version_id = ?,
                  status = 'ready',
                  updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND id = ?`,
          [version.id, tenantId, documentId],
        )
        await connection.execute(
          `UPDATE document_metadata
              SET file_name = COALESCE(?, file_name),
                  file_type = COALESCE(?, file_type),
                  summary = '',
                  updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND document_id = ?`,
          [version.file_name, version.file_type, tenantId, documentId],
        )
        await connection.commit()
        return true
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
                m.file_type,
                v.version_no
           FROM document_chunks c
           JOIN documents d
             ON d.tenant_id = c.tenant_id
            AND d.id = c.document_id
            AND d.status = 'ready'
            AND d.deleted_at IS NULL
            AND d.current_version_id = c.document_version_id
           JOIN document_versions v
             ON v.tenant_id = c.tenant_id
            AND v.id = c.document_version_id
            AND v.status = 'ready'
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
        versionNo: Number(row.version_no),
      }))
    },

    async findDocumentFile(tenantId, publicId, versionNo) {
      const versionClause = versionNo
        ? "AND v.version_no = ? AND v.status = 'ready'"
        : 'AND v.id = d.current_version_id'
      const params: Array<string | number> = versionNo
        ? [versionNo, tenantId, publicId]
        : [tenantId, publicId]
      const [rows] = await pool.execute<FileRow[]>(
        `SELECT v.storage_key,
                COALESCE(v.file_name, m.file_name) AS file_name,
                v.mime_type,
                v.size_bytes,
                v.version_no
           FROM documents d
           JOIN document_metadata m
             ON m.tenant_id = d.tenant_id
            AND m.document_id = d.id
           JOIN document_versions v
             ON v.tenant_id = d.tenant_id
            AND v.document_id = d.id
            ${versionClause}
          WHERE d.tenant_id = ?
            AND d.public_id = ?
            AND d.status = 'ready'
            AND d.deleted_at IS NULL
          LIMIT 1`,
        params,
      )
      const row = rows.at(0)
      if (!row) return null
      return {
        storageKey: row.storage_key,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: Number(row.size_bytes),
        versionNo: Number(row.version_no),
      } satisfies KnowledgeFileRecord
    },

    async softDeleteDocument(tenantId, publicId) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [documentRows] = await connection.execute<IdRow[]>(
          `SELECT id
             FROM documents
            WHERE tenant_id = ? AND public_id = ?
            FOR UPDATE`,
          [tenantId, publicId],
        )
        const documentId = documentRows.at(0)?.id
        if (!documentId) {
          await connection.rollback()
          return null
        }
        const [keyRows] = await connection.execute<StorageKeyRow[]>(
          `SELECT storage_key
             FROM document_versions
            WHERE tenant_id = ? AND document_id = ?`,
          [tenantId, documentId],
        )
        await connection.execute(
          `UPDATE documents
              SET status = 'archived',
                  deleted_at = UTC_TIMESTAMP(3),
                  updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
          [tenantId, documentId],
        )
        await connection.commit()
        return {
          documentId: String(documentId),
          storageKeys: keyRows.map((row) => row.storage_key),
        } satisfies KnowledgeDeleteRecord
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async markEmbeddingRecordsDeleted(tenantId, documentId) {
      await pool.execute(
        `UPDATE embedding_records er
           JOIN document_chunks c
             ON c.tenant_id = er.tenant_id
            AND c.id = er.chunk_id
            SET er.status = 'deleted',
                er.updated_at = UTC_TIMESTAMP(3)
          WHERE er.tenant_id = ?
            AND c.document_id = ?`,
        [tenantId, documentId],
      )
    },

    async cancelEmbeddingJobs(tenantId, documentId) {
      await pool.execute(
        `UPDATE embedding_jobs
            SET status = 'canceled',
                stage = NULL,
                progress = 100,
                finished_at = UTC_TIMESTAMP(3),
                updated_at = UTC_TIMESTAMP(3)
          WHERE tenant_id = ?
            AND document_id = ?
            AND status IN ('pending', 'running')`,
        [tenantId, documentId],
      )
    },
  }
}
