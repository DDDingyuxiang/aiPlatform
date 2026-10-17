import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { AttendanceStatus } from '@aiplatform/contracts'
import {
  DuplicateEmailError,
  type AttendanceDayRecord,
  type DepartmentRecord,
  type IdentityRepository,
  type LoginCandidate,
  type MemberRecord,
  type ProfileRecord,
  type ProfileUpdateRecord,
} from './types.js'

interface LoginRow extends RowDataPacket {
  id: string
  tenant_id: string
  public_id: string
  username: string
  status: string
  company_status: string
  password_hash: string
}

interface ProfileRow extends RowDataPacket {
  id: string
  tenant_id: string
  public_id: string
  username: string
  display_name: string
  employee_no: string
  position: string | null
  email: string
  phone: string | null
  status: string
  department_name: string | null
}

interface RoleRow extends RowDataPacket {
  code: string
}

interface DepartmentRow extends RowDataPacket {
  id: string
  name: string
}

interface MemberRow extends RowDataPacket {
  public_id: string
  display_name: string
  employee_no: string
  position: string | null
  email: string
  phone: string | null
  department_id: string
  department_name: string
}

interface AttendanceRow extends RowDataPacket {
  work_date: string
  status: string
}

function toAttendanceStatus(value: string): AttendanceStatus {
  return value === 'late' || value === 'absent' ? value : 'normal'
}

type SqlParam = string | number | null

function isDuplicateEntry(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ER_DUP_ENTRY'
  )
}

/** MySQL 实现：只负责数据访问，不做业务判定 */
export function createMySqlIdentityRepository(pool: Pool): IdentityRepository {
  return {
    async findLoginCandidates(username) {
      const [rows] = await pool.execute<LoginRow[]>(
        `SELECT e.id,
                e.tenant_id,
                e.public_id,
                e.username,
                e.status,
                c.status AS company_status,
                cred.password_hash
           FROM employees e
           JOIN companies c
             ON c.id = e.tenant_id
            AND c.deleted_at IS NULL
           JOIN employee_credentials cred
             ON cred.tenant_id = e.tenant_id
            AND cred.employee_id = e.id
            AND cred.credential_type = 'password'
          WHERE e.username = ?
            AND e.deleted_at IS NULL
          ORDER BY e.id
          LIMIT 2`,
        [username],
      )

      return rows.map<LoginCandidate>((row) => ({
        tenantId: row.tenant_id,
        employeeId: row.id,
        publicId: row.public_id,
        username: row.username,
        employeeStatus: row.status,
        companyStatus: row.company_status,
        passwordHash: row.password_hash,
      }))
    },

    async findProfile(tenantId, employeeId) {
      const [profileRows] = await pool.execute<ProfileRow[]>(
        `SELECT e.id,
                e.tenant_id,
                e.public_id,
                e.username,
                e.display_name,
                e.employee_no,
                e.position,
                e.email,
                e.phone,
                e.status,
                d.name AS department_name
           FROM employees e
           LEFT JOIN employee_department_memberships m
             ON m.tenant_id = e.tenant_id
            AND m.employee_id = e.id
            AND m.is_primary = 1
           LEFT JOIN departments d
             ON d.tenant_id = e.tenant_id
            AND d.id = m.department_id
            AND d.deleted_at IS NULL
          WHERE e.tenant_id = ?
            AND e.id = ?
            AND e.deleted_at IS NULL
          LIMIT 1`,
        [tenantId, employeeId],
      )

      const profile = profileRows.at(0)
      if (!profile) return null

      const [roleRows] = await pool.execute<RoleRow[]>(
        `SELECT r.code
           FROM employee_roles er
           JOIN roles r
             ON r.tenant_id = er.tenant_id
            AND r.id = er.role_id
            AND r.deleted_at IS NULL
          WHERE er.tenant_id = ?
            AND er.employee_id = ?
          ORDER BY r.code`,
        [tenantId, employeeId],
      )

      return {
        tenantId: profile.tenant_id,
        employeeId: profile.id,
        publicId: profile.public_id,
        username: profile.username,
        name: profile.display_name,
        employeeNo: profile.employee_no,
        position: profile.position,
        email: profile.email,
        phone: profile.phone,
        status: profile.status,
        department: profile.department_name,
        roleCodes: roleRows.map((row) => row.code),
      } satisfies ProfileRecord
    },

    async listDepartments(tenantId) {
      const [rows] = await pool.execute<DepartmentRow[]>(
        `SELECT id, name
           FROM departments
          WHERE tenant_id = ?
            AND status = 'active'
            AND deleted_at IS NULL
          ORDER BY name`,
        [tenantId],
      )

      return rows.map<DepartmentRecord>((row) => ({ id: row.id, name: row.name }))
    },

    async listMembers(tenantId) {
      const [rows] = await pool.execute<MemberRow[]>(
        `SELECT e.public_id,
                e.display_name,
                e.employee_no,
                e.position,
                e.email,
                e.phone,
                d.id AS department_id,
                d.name AS department_name
           FROM employees e
           JOIN employee_department_memberships m
             ON m.tenant_id = e.tenant_id
            AND m.employee_id = e.id
            AND m.is_primary = 1
           JOIN departments d
             ON d.tenant_id = e.tenant_id
            AND d.id = m.department_id
            AND d.status = 'active'
            AND d.deleted_at IS NULL
          WHERE e.tenant_id = ?
            AND e.status = 'active'
            AND e.deleted_at IS NULL
          ORDER BY d.name, e.display_name`,
        [tenantId],
      )

      return rows.map<MemberRecord>((row) => ({
        id: row.public_id,
        name: row.display_name,
        employeeId: row.employee_no,
        position: row.position,
        departmentId: row.department_id,
        department: row.department_name,
        email: row.email,
        phone: row.phone,
      }))
    },

    async listAttendance(tenantId, employeeId, startDate, nextMonthStartDate) {
      const [rows] = await pool.execute<AttendanceRow[]>(
        `SELECT DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
                status
           FROM attendance_records
          WHERE tenant_id = ?
            AND employee_id = ?
            AND work_date >= ?
            AND work_date < ?
          ORDER BY work_date`,
        [tenantId, employeeId, startDate, nextMonthStartDate],
      )

      return rows.map<AttendanceDayRecord>((row) => ({
        date: row.work_date,
        status: toAttendanceStatus(row.status),
      }))
    },

    async updateProfile(tenantId, employeeId, changes: ProfileUpdateRecord) {
      const assignments: string[] = []
      const params: SqlParam[] = []

      if (changes.name !== undefined) {
        assignments.push('display_name = ?')
        params.push(changes.name)
      }
      if (changes.position !== undefined) {
        assignments.push('position = ?')
        params.push(changes.position)
      }
      if (changes.email !== undefined) {
        assignments.push('email = ?')
        params.push(changes.email)
      }
      if (changes.phone !== undefined) {
        assignments.push('phone = ?')
        params.push(changes.phone)
      }
      if (assignments.length === 0) return

      params.push(tenantId, employeeId)

      try {
        await pool.execute(
          `UPDATE employees
              SET ${assignments.join(', ')},
                  updated_at = CURRENT_TIMESTAMP(3)
            WHERE tenant_id = ?
              AND id = ?
              AND deleted_at IS NULL`,
          params,
        )
      } catch (error) {
        // 唯一键 (tenant_id, email)：由服务层转换为 40901
        if (isDuplicateEntry(error)) throw new DuplicateEmailError()
        throw error
      }
    },
  }
}
