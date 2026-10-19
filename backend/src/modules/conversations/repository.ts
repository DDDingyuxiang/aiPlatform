import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise'
import type { ChatMessageType } from '@aiplatform/contracts'
import type {
  AttachmentRecord,
  ConversationsRepository,
  ConversationMemberRecord,
  ConversationRecord,
  ConversationRefRecord,
  CreateConversationRecord,
  CreateMessageRecord,
  EmployeeRefRecord,
  MessageRecord,
} from './types.js'

interface EmployeeRow extends RowDataPacket {
  id: string
  public_id: string
  display_name: string
  status: string
}

interface ConversationRow extends RowDataPacket {
  id: string
  public_id: string
  type: string
  title: string | null
  last_message_at: Date | null
  created_at: Date
  last_content: string | null
  last_type: string | null
  last_file_name: string | null
}

interface ParticipantRow extends RowDataPacket {
  conversation_id: string
  employee_id: string
  public_id: string
  display_name: string
}

interface MessageRow extends RowDataPacket {
  id: string
  conversation_id: string
  conversation_public_id: string
  sender_public_id: string
  message_type: string
  content: string | null
  created_at: Date
}

interface AttachmentRow extends RowDataPacket {
  id: string
  message_id: string
  file_name: string
  mime_type: string
  size_bytes: string | number
  storage_key: string
}

/**
 * 会话列表/详情共用查询。
 *
 * 最后一条消息通过相关子查询取得，保证会话按最后活跃时间排序；
 * 预览中的文件名只用于展示，不参与权限判断。
 */
const CONVERSATION_SELECT = `
SELECT c.id,
       c.public_id,
       c.type,
       c.title,
       c.last_message_at,
       c.created_at,
       lm.content AS last_content,
       lm.message_type AS last_type,
       (SELECT a.file_name
          FROM message_attachments a
         WHERE a.tenant_id = lm.tenant_id
           AND a.message_id = lm.id
         ORDER BY a.id
         LIMIT 1) AS last_file_name
  FROM conversations c
  LEFT JOIN messages lm
    ON lm.id = (
      SELECT m2.id
        FROM messages m2
       WHERE m2.tenant_id = c.tenant_id
         AND m2.conversation_id = c.id
         AND m2.deleted_at IS NULL
       ORDER BY m2.created_at DESC, m2.id DESC
       LIMIT 1
    )`

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toMessageType(value: string | null): ChatMessageType {
  return value === 'image' || value === 'file' || value === 'system' ? value : 'text'
}

/** 列表预览：文本取正文，图片/文件取类型标签 + 文件名 */
function toLastMessagePreview(row: ConversationRow): string {
  if (!row.last_type) return ''
  if (row.last_type === 'text' || row.last_type === 'system') {
    return row.last_content ?? ''
  }
  const label = row.last_type === 'image' ? '[图片]' : '[文件]'
  return row.last_file_name ? `${label} ${row.last_file_name}` : label
}

function toConversationRecord(
  row: ConversationRow,
  participants: ConversationMemberRecord[],
): ConversationRecord {
  return {
    conversationId: row.id,
    publicId: row.public_id,
    type: row.type === 'group' ? 'group' : 'direct',
    title: row.title,
    participants,
    lastMessage: toLastMessagePreview(row),
    updatedAt: toIsoString(row.last_message_at ?? row.created_at),
  }
}

function toAttachmentRecord(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    storageKey: row.storage_key,
  }
}

function toMessageRecord(row: MessageRow, attachments: AttachmentRecord[]): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    conversationPublicId: row.conversation_public_id,
    senderPublicId: row.sender_public_id,
    content: row.content ?? '',
    type: toMessageType(row.message_type),
    attachments,
    sentAt: toIsoString(row.created_at),
  }
}

/** MySQL 实现：只负责数据访问，租户与成员权限由服务层判定 */
export function createMySqlConversationsRepository(pool: Pool): ConversationsRepository {
  async function withTransaction<T>(
    work: (connection: PoolConnection) => Promise<T>,
  ): Promise<T> {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const result = await work(connection)
      await connection.commit()
      return result
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  async function loadParticipants(
    tenantId: string,
    conversationIds: string[],
    executor: Pick<Pool, 'execute'> = pool,
  ): Promise<Map<string, ConversationMemberRecord[]>> {
    const result = new Map<string, ConversationMemberRecord[]>()
    if (conversationIds.length === 0) return result

    const placeholders = conversationIds.map(() => '?').join(', ')
    const [rows] = await executor.execute<ParticipantRow[]>(
      `SELECT cm.conversation_id,
              cm.employee_id,
              e.public_id,
              e.display_name
         FROM conversation_members cm
         JOIN employees e
           ON e.tenant_id = cm.tenant_id
          AND e.id = cm.employee_id
        WHERE cm.tenant_id = ?
          AND cm.conversation_id IN (${placeholders})
          AND cm.left_at IS NULL
        ORDER BY cm.id`,
      [tenantId, ...conversationIds],
    )

    for (const row of rows) {
      const members = result.get(row.conversation_id) ?? []
      members.push({
        employeeId: row.employee_id,
        publicId: row.public_id,
        name: row.display_name,
      })
      result.set(row.conversation_id, members)
    }
    return result
  }

  async function loadAttachments(
    tenantId: string,
    messageIds: string[],
    executor: Pick<Pool, 'execute'> = pool,
  ): Promise<Map<string, AttachmentRecord[]>> {
    const result = new Map<string, AttachmentRecord[]>()
    if (messageIds.length === 0) return result

    const placeholders = messageIds.map(() => '?').join(', ')
    const [rows] = await executor.execute<AttachmentRow[]>(
      `SELECT id, message_id, file_name, mime_type, size_bytes, storage_key
         FROM message_attachments
        WHERE tenant_id = ?
          AND message_id IN (${placeholders})
        ORDER BY id`,
      [tenantId, ...messageIds],
    )

    for (const row of rows) {
      const attachments = result.get(row.message_id) ?? []
      attachments.push(toAttachmentRecord(row))
      result.set(row.message_id, attachments)
    }
    return result
  }

  async function hydrateConversations(
    tenantId: string,
    rows: ConversationRow[],
  ): Promise<ConversationRecord[]> {
    const participants = await loadParticipants(
      tenantId,
      rows.map((row) => row.id),
    )
    return rows.map((row) =>
      toConversationRecord(row, participants.get(row.id) ?? []),
    )
  }

  return {
    async findEmployeesByPublicIds(tenantId, publicIds) {
      if (publicIds.length === 0) return []

      const placeholders = publicIds.map(() => '?').join(', ')
      const [rows] = await pool.execute<EmployeeRow[]>(
        `SELECT id, public_id, display_name, status
           FROM employees
          WHERE tenant_id = ?
            AND public_id IN (${placeholders})
            AND deleted_at IS NULL`,
        [tenantId, ...publicIds],
      )

      return rows.map<EmployeeRefRecord>((row) => ({
        employeeId: row.id,
        publicId: row.public_id,
        name: row.display_name,
        status: row.status,
      }))
    },

    async findDirectConversation(tenantId, firstEmployeeId, secondEmployeeId) {
      const [rows] = await pool.execute<ConversationRow[]>(
        `${CONVERSATION_SELECT}
          JOIN conversation_members cm
            ON cm.tenant_id = c.tenant_id
           AND cm.conversation_id = c.id
           AND cm.employee_id = ?
           AND cm.left_at IS NULL
         WHERE c.tenant_id = ?
           AND c.type = 'direct'
           AND c.status = 'active'
           AND c.deleted_at IS NULL
           AND EXISTS (
             SELECT 1
               FROM conversation_members cm2
              WHERE cm2.tenant_id = c.tenant_id
                AND cm2.conversation_id = c.id
                AND cm2.employee_id = ?
                AND cm2.left_at IS NULL
           )
           AND (
             SELECT COUNT(*)
               FROM conversation_members cm3
              WHERE cm3.tenant_id = c.tenant_id
                AND cm3.conversation_id = c.id
                AND cm3.left_at IS NULL
           ) = 2
         ORDER BY c.id
         LIMIT 1`,
        [firstEmployeeId, tenantId, secondEmployeeId],
      )

      const row = rows.at(0)
      if (!row) return null
      const [conversation] = await hydrateConversations(tenantId, [row])
      return conversation ?? null
    },

    async createConversation(tenantId, record: CreateConversationRecord) {
      await withTransaction(async (connection) => {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO conversations
             (tenant_id, public_id, type, title, created_by, status)
           VALUES (?, ?, ?, ?, ?, 'active')`,
          [tenantId, record.publicId, record.type, record.title, record.createdBy],
        )
        const conversationId = String(result.insertId)

        for (const memberId of record.memberIds) {
          await connection.execute(
            `INSERT INTO conversation_members
               (tenant_id, conversation_id, employee_id, member_role)
             VALUES (?, ?, ?, ?)`,
            [
              tenantId,
              conversationId,
              memberId,
              memberId === record.createdBy ? 'owner' : 'member',
            ],
          )
        }
      })
    },

    async listConversations(tenantId, employeeId) {
      const [rows] = await pool.execute<ConversationRow[]>(
        `${CONVERSATION_SELECT}
          JOIN conversation_members cm
            ON cm.tenant_id = c.tenant_id
           AND cm.conversation_id = c.id
           AND cm.employee_id = ?
           AND cm.left_at IS NULL
         WHERE c.tenant_id = ?
           AND c.status = 'active'
           AND c.deleted_at IS NULL
         ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC`,
        [employeeId, tenantId],
      )
      return hydrateConversations(tenantId, rows)
    },

    async findConversationForMember(tenantId, publicId, employeeId) {
      const [rows] = await pool.execute<ConversationRow[]>(
        `${CONVERSATION_SELECT}
          JOIN conversation_members cm
            ON cm.tenant_id = c.tenant_id
           AND cm.conversation_id = c.id
           AND cm.employee_id = ?
           AND cm.left_at IS NULL
         WHERE c.tenant_id = ?
           AND c.public_id = ?
           AND c.status = 'active'
           AND c.deleted_at IS NULL
         LIMIT 1`,
        [employeeId, tenantId, publicId],
      )

      const row = rows.at(0)
      if (!row) return null
      const [conversation] = await hydrateConversations(tenantId, [row])
      return conversation ?? null
    },

    async listMessages(tenantId, conversationId) {
      const [rows] = await pool.execute<MessageRow[]>(
        `SELECT m.id,
                m.conversation_id,
                c.public_id AS conversation_public_id,
                e.public_id AS sender_public_id,
                m.message_type,
                m.content,
                m.created_at
           FROM messages m
           JOIN conversations c
             ON c.tenant_id = m.tenant_id
            AND c.id = m.conversation_id
           JOIN employees e
             ON e.tenant_id = m.tenant_id
            AND e.id = m.sender_employee_id
          WHERE m.tenant_id = ?
            AND m.conversation_id = ?
            AND m.deleted_at IS NULL
          ORDER BY m.created_at, m.id`,
        [tenantId, conversationId],
      )

      const attachments = await loadAttachments(
        tenantId,
        rows.map((row) => row.id),
      )
      return rows.map((row) => toMessageRecord(row, attachments.get(row.id) ?? []))
    },

    async listRecentMessages(tenantId, conversationId, limit, options = {}) {
      const systemClause = options.excludeSystem
        ? `AND m.message_type <> 'system'`
        : ''
      const [rows] = await pool.execute<MessageRow[]>(
        `SELECT m.id,
                m.conversation_id,
                c.public_id AS conversation_public_id,
                e.public_id AS sender_public_id,
                m.message_type,
                m.content,
                m.created_at
           FROM messages m
           JOIN conversations c
             ON c.tenant_id = m.tenant_id
            AND c.id = m.conversation_id
           JOIN employees e
             ON e.tenant_id = m.tenant_id
            AND e.id = m.sender_employee_id
          WHERE m.tenant_id = ?
            AND m.conversation_id = ?
            AND m.deleted_at IS NULL
            ${systemClause}
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT ?`,
        [tenantId, conversationId, limit],
      )

      const chronological = rows.reverse()
      const attachments = await loadAttachments(
        tenantId,
        chronological.map((row) => row.id),
      )
      return chronological.map((row) =>
        toMessageRecord(row, attachments.get(row.id) ?? []),
      )
    },

    async createMessage(tenantId, conversation, senderEmployeeId, record) {
      return withTransaction(async (connection) => {
        const [messageResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO messages
             (tenant_id, conversation_id, sender_employee_id, message_type, content)
           VALUES (?, ?, ?, ?, ?)`,
          [
            tenantId,
            conversation.conversationId,
            senderEmployeeId,
            record.type,
            record.content || null,
          ],
        )
        const messageId = String(messageResult.insertId)

        if (record.attachment) {
          await connection.execute(
            `INSERT INTO message_attachments
               (tenant_id, message_id, storage_key, file_name, mime_type, size_bytes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              tenantId,
              messageId,
              record.attachment.storageKey,
              record.attachment.fileName,
              record.attachment.mimeType,
              record.attachment.sizeBytes,
            ],
          )
        }

        await connection.execute(
          `UPDATE conversations
              SET last_message_at = UTC_TIMESTAMP(3),
                  updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ?
              AND id = ?`,
          [tenantId, conversation.conversationId],
        )

        const [rows] = await connection.execute<MessageRow[]>(
          `SELECT m.id,
                  m.conversation_id,
                  c.public_id AS conversation_public_id,
                  e.public_id AS sender_public_id,
                  m.message_type,
                  m.content,
                  m.created_at
             FROM messages m
             JOIN conversations c
               ON c.tenant_id = m.tenant_id
              AND c.id = m.conversation_id
             JOIN employees e
               ON e.tenant_id = m.tenant_id
              AND e.id = m.sender_employee_id
            WHERE m.tenant_id = ?
              AND m.id = ?
            LIMIT 1`,
          [tenantId, messageId],
        )
        const row = rows.at(0)
        if (!row) throw new Error('创建消息后读取失败')

        // 附件在同一事务内刚插入，必须用事务连接读取，连接池看不到未提交数据
        const attachments = await loadAttachments(tenantId, [messageId], connection)
        return toMessageRecord(row, attachments.get(messageId) ?? [])
      })
    },

    async findAttachmentForMember(tenantId, conversationPublicId, attachmentId, employeeId) {
      const [rows] = await pool.execute<AttachmentRow[]>(
        `SELECT a.id,
                a.message_id,
                a.file_name,
                a.mime_type,
                a.size_bytes,
                a.storage_key
           FROM message_attachments a
           JOIN messages m
             ON m.tenant_id = a.tenant_id
            AND m.id = a.message_id
            AND m.deleted_at IS NULL
           JOIN conversations c
             ON c.tenant_id = m.tenant_id
            AND c.id = m.conversation_id
            AND c.public_id = ?
            AND c.status = 'active'
            AND c.deleted_at IS NULL
           JOIN conversation_members cm
             ON cm.tenant_id = m.tenant_id
            AND cm.conversation_id = m.conversation_id
            AND cm.employee_id = ?
            AND cm.left_at IS NULL
          WHERE a.tenant_id = ?
            AND a.id = ?
          LIMIT 1`,
        [conversationPublicId, employeeId, tenantId, attachmentId],
      )

      const row = rows.at(0)
      return row ? toAttachmentRecord(row) : null
    },
  }
}
