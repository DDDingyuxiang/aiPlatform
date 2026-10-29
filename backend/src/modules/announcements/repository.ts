import type { Pool, RowDataPacket } from 'mysql2/promise'
import { ulid } from 'ulid'
import type { CreateAnnouncementPayload } from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'
import type { AnnouncementItem, AnnouncementsRepository } from './types.js'

interface AnnouncementRow extends RowDataPacket {
  public_id: string
  title: string
  paragraphs: string | string[]
  scope: AnnouncementItem['scope']
  department: string | null
  publisher_public_id: string
  publisher_name: string
  published_at: Date | string
  is_read: number | boolean
  pinned: number | boolean
  attachments: string | AnnouncementItem['attachments']
}

function parseJson<T>(value: string | T): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : value
}

function isTrue(value: number | boolean | string): boolean {
  return value === true || value === 1 || value === '1'
}

function visibleWhere(alias = 'a'): string {
  return `(${alias}.scope <> 'department' OR EXISTS (
    SELECT 1
      FROM employee_department_memberships edm
     WHERE edm.tenant_id = ${alias}.tenant_id
       AND edm.employee_id = ?
       AND edm.department_id = ${alias}.department_id
  ))`
}

function toItem(row: AnnouncementRow): AnnouncementItem {
  const publishedAt = row.published_at instanceof Date
    ? row.published_at
    : new Date(
        /(?:Z|[+-]\d{2}:?\d{2})$/i.test(String(row.published_at))
          ? String(row.published_at)
          : `${String(row.published_at).replace(' ', 'T')}Z`,
      )
  return {
    id: row.public_id,
    title: row.title,
    paragraphs: parseJson<string[]>(row.paragraphs),
    scope: row.scope,
    ...(row.department ? { department: row.department } : {}),
    publisher: { id: row.publisher_public_id, name: row.publisher_name },
    publishedAt: publishedAt.toISOString(),
    read: isTrue(row.is_read),
    pinned: isTrue(row.pinned),
    attachments: parseJson<AnnouncementItem['attachments']>(row.attachments),
  }
}

/** 公告查询始终按登录上下文中的 tenant 和 employee 过滤。 */
export function createMySqlAnnouncementsRepository(pool: Pool): AnnouncementsRepository {
  return {
    async create(auth, payload: CreateAnnouncementPayload) {
      let departmentId: string | null = null
      if (payload.scope === 'department') {
        const departmentName = payload.department
        if (!departmentName) return false
        const [departments] = await pool.execute<RowDataPacket[]>(
          `SELECT id FROM departments
            WHERE tenant_id = ? AND name = ? AND status = 'active'
              AND deleted_at IS NULL
            LIMIT 2`,
          [auth.tenantId, departmentName],
        )
        // Refuse ambiguous names rather than publish to an unintended department.
        if (departments.length !== 1) return false
        departmentId = String(departments[0]!.id)
      }

      await pool.execute(
        `INSERT INTO announcements
           (tenant_id, public_id, title, paragraphs, scope, department_id,
            publisher_employee_id, pinned, attachments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, JSON_ARRAY())`,
        [
          auth.tenantId,
          ulid(),
          payload.title,
          JSON.stringify(payload.paragraphs),
          payload.scope,
          departmentId,
          auth.employeeId,
          payload.pinned ?? false,
        ],
      )
      return true
    },

    async list(auth) {
      const [rows] = await pool.execute<AnnouncementRow[]>(
        `SELECT a.public_id, a.title, a.paragraphs, a.scope,
                d.name AS department, p.public_id AS publisher_public_id,
                p.display_name AS publisher_name, a.published_at, a.pinned,
                a.attachments,
                (r.employee_id IS NOT NULL OR a.publisher_employee_id = ?) AS is_read
           FROM announcements a
           JOIN employees p
             ON p.tenant_id = a.tenant_id AND p.id = a.publisher_employee_id
           LEFT JOIN departments d
             ON d.tenant_id = a.tenant_id AND d.id = a.department_id
           LEFT JOIN announcement_reads r
             ON r.tenant_id = a.tenant_id
            AND r.announcement_id = a.id
            AND r.employee_id = ?
          WHERE a.tenant_id = ?
            AND a.deleted_at IS NULL
            AND a.published_at <= UTC_TIMESTAMP(3)
            AND ${visibleWhere()}
          ORDER BY a.pinned DESC, a.published_at DESC, a.id DESC`,
        [auth.employeeId, auth.employeeId, auth.tenantId, auth.employeeId],
      )
      return rows.map(toItem)
    },

    async markRead(auth, publicId) {
      const [result] = await pool.execute(
        `INSERT IGNORE INTO announcement_reads (tenant_id, announcement_id, employee_id)
         SELECT a.tenant_id, a.id, ?
           FROM announcements a
          WHERE a.tenant_id = ?
            AND a.public_id = ?
            AND a.deleted_at IS NULL
            AND a.published_at <= UTC_TIMESTAMP(3)
            AND ${visibleWhere()}`,
        [auth.employeeId, auth.tenantId, publicId, auth.employeeId],
      )
      const affectedRows = (result as { affectedRows: number }).affectedRows
      if (affectedRows > 0) return true

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT 1
           FROM announcements a
          WHERE a.tenant_id = ? AND a.public_id = ?
            AND a.deleted_at IS NULL
            AND a.published_at <= UTC_TIMESTAMP(3)
            AND ${visibleWhere()}
          LIMIT 1`,
        [auth.tenantId, publicId, auth.employeeId],
      )
      return rows.length > 0
    },

    async markAllRead(auth) {
      await pool.execute(
        `INSERT IGNORE INTO announcement_reads (tenant_id, announcement_id, employee_id)
         SELECT a.tenant_id, a.id, ?
           FROM announcements a
          WHERE a.tenant_id = ?
            AND a.deleted_at IS NULL
            AND a.published_at <= UTC_TIMESTAMP(3)
            AND ${visibleWhere()}`,
        [auth.employeeId, auth.tenantId, auth.employeeId],
      )
    },
  }
}
