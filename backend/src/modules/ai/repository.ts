import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import {
  aiChatSourceSchema,
  type AiChatSource,
  type AiKnowledgeStatus,
} from '@aiplatform/contracts'
import { ulid } from 'ulid'
import type {
  AiChatRepository,
  AiConversationRecord,
  AiMessagePage,
  AiMessageRecord,
  AiMessageRole,
  AiMessageStatus,
  AiSummaryRecord,
  CreateAiAssistantMessageInput,
  CreateAiSummaryInput,
  CreateAiUserMessageInput,
  UpdateAiAssistantMessageInput,
} from './types.js'

interface ConversationRow extends RowDataPacket {
  id: string
  public_id: string
  title: string
  last_message_at: Date | string | null
  last_message_preview: string | null
  created_at: Date | string
  updated_at: Date | string
}

interface MessageRow extends RowDataPacket {
  id: string
  public_id: string
  ai_conversation_id: string
  role: string
  content: string
  client_message_id: string | null
  reply_to_message_id: string | null
  model_name: string | null
  sources_json: unknown
  knowledge_status: string | null
  status: string
  error_code: string | null
  created_at: Date | string
  updated_at: Date | string
}

interface SummaryRow extends RowDataPacket {
  id: string
  summary_no: number
  summary: string
  covered_message_id: string
  covered_message_public_id: string | null
  prompt_version: string
  model_name: string | null
  created_at: Date | string
}

interface IdRow extends RowDataPacket {
  id: string
}

const STATUSES = new Set<AiMessageStatus>([
  'streaming',
  'completed',
  'failed',
  'interrupted',
])

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIso(value)
}

function toRole(value: string): AiMessageRole {
  return value === 'assistant' ? 'assistant' : 'user'
}

function toStatus(value: string): AiMessageStatus {
  return STATUSES.has(value as AiMessageStatus)
    ? (value as AiMessageStatus)
    : 'failed'
}

const KNOWLEDGE_STATUSES = new Set<AiKnowledgeStatus>([
  'used',
  'empty',
  'unavailable',
  'disabled',
  'unknown',
])

function toKnowledgeStatus(value: string | null): AiKnowledgeStatus | null {
  return value && KNOWLEDGE_STATUSES.has(value as AiKnowledgeStatus)
    ? (value as AiKnowledgeStatus)
    : null
}

function parseSources(value: unknown): AiChatSource[] {
  if (!value) return []
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return []
    }
  }
  const parsed = aiChatSourceSchema.array().safeParse(raw)
  return parsed.success ? parsed.data : []
}

function toConversation(row: ConversationRow): AiConversationRecord {
  return {
    id: String(row.id),
    publicId: row.public_id,
    title: row.title,
    lastMessageAt: toIsoOrNull(row.last_message_at),
    lastMessagePreview: row.last_message_preview,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function toMessage(row: MessageRow): AiMessageRecord {
  return {
    id: String(row.id),
    publicId: row.public_id,
    conversationId: String(row.ai_conversation_id),
    role: toRole(row.role),
    content: row.content,
    clientMessageId: row.client_message_id,
    replyToMessageId:
      row.reply_to_message_id === null ? null : String(row.reply_to_message_id),
    modelName: row.model_name,
    sources: parseSources(row.sources_json),
    knowledgeStatus: toKnowledgeStatus(row.knowledge_status),
    status: toStatus(row.status),
    errorCode: row.error_code,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function toSummary(row: SummaryRow): AiSummaryRecord {
  return {
    id: String(row.id),
    summaryNo: Number(row.summary_no),
    content: row.summary,
    coveredMessageId: String(row.covered_message_id),
    coveredMessagePublicId: row.covered_message_public_id,
    promptVersion: row.prompt_version,
    modelName: row.model_name,
    createdAt: toIso(row.created_at),
  }
}

const MESSAGE_SELECT = `
SELECT id,
       public_id,
       ai_conversation_id,
       role,
       content,
       client_message_id,
       reply_to_message_id,
       model_name,
       sources_json,
       knowledge_status,
       status,
       error_code,
       created_at,
       updated_at
  FROM ai_messages`

const CONVERSATION_SELECT = `
SELECT id,
       public_id,
       title,
       last_message_at,
       last_message_preview,
       created_at,
       updated_at
  FROM ai_conversations`

/** AI 会话 MySQL 仓储；租户与员工边界由调用方强制传入。 */
export function createMySqlAiChatRepository(pool: Pool): AiChatRepository {
  async function findConversationById(
    tenantId: string,
    employeeId: string,
    conversationId: string,
  ): Promise<AiConversationRecord | null> {
    const [rows] = await pool.execute<ConversationRow[]>(
      `${CONVERSATION_SELECT}
        WHERE tenant_id = ?
          AND employee_id = ?
          AND id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
      [tenantId, employeeId, conversationId],
    )
    const row = rows.at(0)
    return row ? toConversation(row) : null
  }

  async function findMessageById(
    connection: PoolConnection | Pool,
    tenantId: string,
    messageId: string,
  ): Promise<AiMessageRecord | null> {
    const [rows] = await connection.execute<MessageRow[]>(
      `${MESSAGE_SELECT}
        WHERE tenant_id = ? AND id = ?
        LIMIT 1`,
      [tenantId, messageId],
    )
    const row = rows.at(0)
    return row ? toMessage(row) : null
  }

  async function listAfter(
    tenantId: string,
    conversationId: string,
    afterMessageId: string,
    limit: number,
    order: 'ASC' | 'DESC',
  ): Promise<AiMessageRecord[]> {
    const [rows] = await pool.execute<MessageRow[]>(
      `${MESSAGE_SELECT}
        WHERE tenant_id = ?
          AND ai_conversation_id = ?
          AND id > ?
          AND (role = 'user' OR status IN ('completed', 'interrupted'))
        ORDER BY id ${order}
        LIMIT ?`,
      [tenantId, conversationId, afterMessageId, limit],
    )
    const messages = rows.map(toMessage)
    return order === 'DESC' ? messages.reverse() : messages
  }

  return {
    async createConversation(tenantId, employeeId, title) {
      const publicId = ulid()
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO ai_conversations
           (tenant_id, public_id, employee_id, title, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [tenantId, publicId, employeeId, title],
      )
      const conversation = await findConversationById(
        tenantId,
        employeeId,
        String(result.insertId),
      )
      if (!conversation) throw new Error('AI 会话创建后读取失败')
      return conversation
    },

    async listConversations(tenantId, employeeId) {
      const [rows] = await pool.execute<ConversationRow[]>(
        `${CONVERSATION_SELECT}
          WHERE tenant_id = ?
            AND employee_id = ?
            AND status = 'active'
            AND deleted_at IS NULL
          ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
          LIMIT 200`,
        [tenantId, employeeId],
      )
      return rows.map(toConversation)
    },

    async findConversation(tenantId, employeeId, publicId) {
      const [rows] = await pool.execute<ConversationRow[]>(
        `${CONVERSATION_SELECT}
          WHERE tenant_id = ?
            AND employee_id = ?
            AND public_id = ?
            AND deleted_at IS NULL
          LIMIT 1`,
        [tenantId, employeeId, publicId],
      )
      const row = rows.at(0)
      return row ? toConversation(row) : null
    },

    async archiveConversation(tenantId, employeeId, publicId) {
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE ai_conversations
            SET status = 'archived',
                deleted_at = UTC_TIMESTAMP(3),
                updated_at = UTC_TIMESTAMP(3)
          WHERE tenant_id = ?
            AND employee_id = ?
            AND public_id = ?
            AND deleted_at IS NULL`,
        [tenantId, employeeId, publicId],
      )
      return result.affectedRows > 0
    },

    async touchConversation(tenantId, conversationId, preview, at) {
      await pool.execute(
        `UPDATE ai_conversations
            SET last_message_at = ?,
                last_message_preview = ?,
                updated_at = UTC_TIMESTAMP(3)
          WHERE tenant_id = ? AND id = ?`,
        [at, preview.slice(0, 255), tenantId, conversationId],
      )
    },

    async updateTitleIfDefault(tenantId, conversationId, title) {
      await pool.execute(
        `UPDATE ai_conversations
            SET title = ?, updated_at = UTC_TIMESTAMP(3)
          WHERE tenant_id = ? AND id = ? AND title = '新对话'`,
        [title.slice(0, 255), tenantId, conversationId],
      )
    },

    async findUserMessageByClientId(tenantId, conversationId, clientMessageId) {
      const [rows] = await pool.execute<MessageRow[]>(
        `${MESSAGE_SELECT}
          WHERE tenant_id = ?
            AND ai_conversation_id = ?
            AND client_message_id = ?
            AND role = 'user'
          LIMIT 1`,
        [tenantId, conversationId, clientMessageId],
      )
      const row = rows.at(0)
      return row ? toMessage(row) : null
    },

    async findAssistantByUserMessageId(tenantId, conversationId, userMessageId) {
      const [rows] = await pool.execute<MessageRow[]>(
        `${MESSAGE_SELECT}
          WHERE tenant_id = ?
            AND ai_conversation_id = ?
            AND role = 'assistant'
            AND reply_to_message_id = ?
          ORDER BY id DESC
          LIMIT 1`,
        [tenantId, conversationId, userMessageId],
      )
      const row = rows.at(0)
      return row ? toMessage(row) : null
    },

    async createUserMessage(tenantId, conversationId, input) {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO ai_messages
           (tenant_id, public_id, ai_conversation_id, role, content,
            client_message_id, status)
         VALUES (?, ?, ?, 'user', ?, ?, 'completed')
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [
          tenantId,
          input.publicId,
          conversationId,
          input.content,
          input.clientMessageId ?? null,
        ],
      )
      const message = await findMessageById(pool, tenantId, String(result.insertId))
      if (!message) throw new Error('AI 用户消息创建后读取失败')
      return message
    },

    async createAssistantMessage(tenantId, conversationId, input) {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO ai_messages
           (tenant_id, public_id, ai_conversation_id, role, content,
            reply_to_message_id, status)
         VALUES (?, ?, ?, 'assistant', '', ?, 'streaming')`,
        [tenantId, input.publicId, conversationId, input.replyToMessageId],
      )
      const message = await findMessageById(pool, tenantId, String(result.insertId))
      if (!message) throw new Error('AI 助手消息创建后读取失败')
      return message
    },

    async updateAssistantMessage(tenantId, messageId, input: UpdateAiAssistantMessageInput) {
      await pool.execute(
        `UPDATE ai_messages
            SET content = ?,
                model_name = ?,
                sources_json = ?,
                knowledge_status = ?,
                status = ?,
                error_code = ?,
                updated_at = UTC_TIMESTAMP(3)
          WHERE tenant_id = ? AND id = ? AND role = 'assistant'`,
        [
          input.content,
          input.modelName ?? null,
          input.sources && input.sources.length > 0
            ? JSON.stringify(input.sources)
            : null,
          input.knowledgeStatus ?? null,
          input.status,
          input.errorCode ?? null,
          tenantId,
          messageId,
        ],
      )
    },

    async listMessages(tenantId, conversationId, options) {
      let beforeId: string | null = null
      if (options.beforePublicId) {
        const [cursorRows] = await pool.execute<IdRow[]>(
          `SELECT id
             FROM ai_messages
            WHERE tenant_id = ? AND ai_conversation_id = ? AND public_id = ?
            LIMIT 1`,
          [tenantId, conversationId, options.beforePublicId],
        )
        beforeId = cursorRows.at(0)?.id ?? null
        if (!beforeId) return { messages: [], hasMore: false }
      }

      const params: Array<string | number> = [tenantId, conversationId]
      let cursorClause = ''
      if (beforeId) {
        cursorClause = 'AND id < ?'
        params.push(beforeId)
      }
      params.push(options.limit + 1)

      const [rows] = await pool.execute<MessageRow[]>(
        `${MESSAGE_SELECT}
          WHERE tenant_id = ?
            AND ai_conversation_id = ?
            ${cursorClause}
          ORDER BY id DESC
          LIMIT ?`,
        params,
      )
      const hasMore = rows.length > options.limit
      const pageRows = hasMore ? rows.slice(0, options.limit) : rows
      const messages = pageRows.map(toMessage).reverse()
      return { messages, hasMore } satisfies AiMessagePage
    },

    async listRecentMessagesAfter(tenantId, conversationId, afterMessageId, limit) {
      return listAfter(tenantId, conversationId, afterMessageId, limit, 'DESC')
    },

    async listMessagesAfter(tenantId, conversationId, afterMessageId, limit) {
      return listAfter(tenantId, conversationId, afterMessageId, limit, 'ASC')
    },

    async getLatestSummary(tenantId, conversationId) {
      const [rows] = await pool.execute<SummaryRow[]>(
        `SELECT s.id,
                s.summary_no,
                s.summary,
                s.covered_message_id,
                m.public_id AS covered_message_public_id,
                s.prompt_version,
                s.model_name,
                s.created_at
           FROM ai_conversation_summaries s
           LEFT JOIN ai_messages m
             ON m.tenant_id = s.tenant_id
            AND m.id = s.covered_message_id
          WHERE s.tenant_id = ?
            AND s.ai_conversation_id = ?
          ORDER BY s.summary_no DESC
          LIMIT 1`,
        [tenantId, conversationId],
      )
      const row = rows.at(0)
      return row ? toSummary(row) : null
    },

    async createSummary(tenantId, conversationId, input: CreateAiSummaryInput) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        // 锁定父会话，保证 summary_no 并发唯一
        await connection.execute(
          `SELECT id FROM ai_conversations WHERE tenant_id = ? AND id = ? FOR UPDATE`,
          [tenantId, conversationId],
        )
        const [maxRows] = await connection.execute<Array<RowDataPacket & { max_no: number | null }>>(
          `SELECT MAX(summary_no) AS max_no
             FROM ai_conversation_summaries
            WHERE tenant_id = ? AND ai_conversation_id = ?`,
          [tenantId, conversationId],
        )
        const summaryNo = Number(maxRows.at(0)?.max_no ?? 0) + 1
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO ai_conversation_summaries
             (tenant_id, ai_conversation_id, summary_no, summary,
              covered_message_id, prompt_version, model_name)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            conversationId,
            summaryNo,
            input.summary,
            input.coveredMessageId,
            input.promptVersion,
            input.modelName ?? null,
          ],
        )
        const [rows] = await connection.execute<SummaryRow[]>(
          `SELECT s.id,
                  s.summary_no,
                  s.summary,
                  s.covered_message_id,
                  m.public_id AS covered_message_public_id,
                  s.prompt_version,
                  s.model_name,
                  s.created_at
             FROM ai_conversation_summaries s
             LEFT JOIN ai_messages m
               ON m.tenant_id = s.tenant_id
              AND m.id = s.covered_message_id
            WHERE s.tenant_id = ? AND s.id = ?`,
          [tenantId, String(result.insertId)],
        )
        await connection.commit()
        const row = rows.at(0)
        if (!row) throw new Error('AI 摘要创建后读取失败')
        return toSummary(row)
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async markStaleStreamingMessages(tenantId, conversationId, staleBefore) {
      await pool.execute(
        `UPDATE ai_messages
            SET status = 'interrupted',
                updated_at = UTC_TIMESTAMP(3)
          WHERE tenant_id = ?
            AND ai_conversation_id = ?
            AND role = 'assistant'
            AND status = 'streaming'
            AND updated_at < ?`,
        [tenantId, conversationId, staleBefore],
      )
    },
  }
}
