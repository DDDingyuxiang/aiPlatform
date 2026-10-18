import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { TaskPriority } from '@aiplatform/contracts'
import {
  DuplicateTaskSourceError,
  type TaskCreateRecord,
  type TaskEmployeeRef,
  type TaskRecord,
  type TasksRepository,
} from './types.js'

interface TaskRow extends RowDataPacket {
  id: string
  public_id: string
  title: string
  description: string | null
  status: string
  priority: string
  due_at: Date
  progress: string | number
  assignee_employee_id: string
  assignee_public_id: string
  assignee_name: string
  creator_employee_id: string
  creator_public_id: string
  creator_name: string
}

interface EmployeeRow extends RowDataPacket {
  id: string
  public_id: string
  display_name: string
  status: string
}

const TASK_SELECT = `
SELECT t.id,
       t.public_id,
       t.title,
       t.description,
       t.status,
       t.priority,
       t.due_at,
       t.progress,
       t.assignee_employee_id,
       a.public_id AS assignee_public_id,
       a.display_name AS assignee_name,
       t.creator_employee_id,
       c.public_id AS creator_public_id,
       c.display_name AS creator_name
  FROM tasks t
  JOIN employees a
    ON a.tenant_id = t.tenant_id
   AND a.id = t.assignee_employee_id
  JOIN employees c
    ON c.tenant_id = t.tenant_id
   AND c.id = t.creator_employee_id`

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toTaskRecord(row: TaskRow): TaskRecord {
  const status =
    row.status === 'done' ? 'done' : row.status === 'in_progress' ? 'in_progress' : 'todo'
  return {
    taskId: row.id,
    publicId: row.public_id,
    title: row.title,
    description: row.description ?? '',
    status,
    priority:
      row.priority === 'high' || row.priority === 'low' ? row.priority : 'medium',
    dueAt: toIsoString(row.due_at),
    progress: Number(row.progress),
    assignee: {
      employeeId: row.assignee_employee_id,
      publicId: row.assignee_public_id,
      name: row.assignee_name,
    },
    creator: {
      employeeId: row.creator_employee_id,
      publicId: row.creator_public_id,
      name: row.creator_name,
    },
  }
}

function isDuplicateSource(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY' &&
    String(
      (error as { sqlMessage?: unknown; message?: unknown }).sqlMessage ??
        (error as { message?: unknown }).message ??
        '',
    ).includes('uk_tasks_source')
  )
}

/** MySQL 任务仓储；只负责数据访问，权限由服务层判定 */
export function createMySqlTasksRepository(pool: Pool): TasksRepository {
  return {
    async listForEmployee(tenantId, employeeId) {
      const [rows] = await pool.execute<TaskRow[]>(
        `${TASK_SELECT}
          WHERE t.tenant_id = ?
            AND t.deleted_at IS NULL
            AND (t.assignee_employee_id = ? OR t.creator_employee_id = ?)
          ORDER BY t.status = 'done', t.due_at, t.id`,
        [tenantId, employeeId, employeeId],
      )
      return rows.map(toTaskRecord)
    },

    async findForEmployee(tenantId, publicId, employeeId) {
      const [rows] = await pool.execute<TaskRow[]>(
        `${TASK_SELECT}
          WHERE t.tenant_id = ?
            AND t.public_id = ?
            AND t.deleted_at IS NULL
            AND (t.assignee_employee_id = ? OR t.creator_employee_id = ?)
          LIMIT 1`,
        [tenantId, publicId, employeeId, employeeId],
      )
      const row = rows.at(0)
      return row ? toTaskRecord(row) : null
    },

    async findBySourceMessage(tenantId, sourceType, sourceMessageId) {
      const [rows] = await pool.execute<TaskRow[]>(
        `${TASK_SELECT}
          WHERE t.tenant_id = ?
            AND t.source_type = ?
            AND t.source_message_id = ?
            AND t.deleted_at IS NULL
          LIMIT 1`,
        [tenantId, sourceType, sourceMessageId],
      )
      const row = rows.at(0)
      return row ? toTaskRecord(row) : null
    },

    async create(tenantId, record: TaskCreateRecord) {
      try {
        await pool.execute(
          `INSERT INTO tasks
             (tenant_id, public_id, title, description, status, priority, due_at,
              assignee_employee_id, creator_employee_id, progress,
              source_type, source_conversation_id, source_message_id)
           VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?, 0, ?, ?, ?)`,
          [
            tenantId,
            record.publicId,
            record.title,
            record.description || null,
            record.priority,
            record.dueAt,
            record.assigneeEmployeeId,
            record.creatorEmployeeId,
            record.sourceType ?? null,
            record.sourceConversationId ?? null,
            record.sourceMessageId ?? null,
          ],
        )
      } catch (error) {
        if (isDuplicateSource(error)) throw new DuplicateTaskSourceError()
        throw error
      }
    },

    async update(tenantId, taskId, record) {
      const assignments: string[] = []
      const params: Array<string | Date | null> = []

      if (record.title !== undefined) {
        assignments.push('title = ?')
        params.push(record.title)
      }
      if (record.description !== undefined) {
        assignments.push('description = ?')
        params.push(record.description || null)
      }
      if (record.priority !== undefined) {
        assignments.push('priority = ?')
        params.push(record.priority)
      }
      if (record.dueAt !== undefined) {
        assignments.push('due_at = ?')
        params.push(record.dueAt)
      }
      if (record.assigneeEmployeeId !== undefined) {
        assignments.push('assignee_employee_id = ?')
        params.push(record.assigneeEmployeeId)
      }

      // 状态流转保留原进度语义：完成置 100，其余回到 0
      if (record.status) {
        assignments.push(
          'status = ?',
          "progress = CASE WHEN ? = 'done' THEN 100 ELSE 0 END",
        )
        params.push(record.status, record.status)
      }

      if (assignments.length === 0) return
      assignments.push('updated_at = UTC_TIMESTAMP(3)')
      params.push(tenantId, taskId)
      await pool.execute(
        `UPDATE tasks
            SET ${assignments.join(', ')}
          WHERE tenant_id = ?
            AND id = ?
            AND deleted_at IS NULL`,
        params,
      )
    },

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
      return rows.map<TaskEmployeeRef>((row) => ({
        employeeId: row.id,
        publicId: row.public_id,
        name: row.display_name,
        status: row.status,
      }))
    },
  }
}

export type { TaskPriority }
