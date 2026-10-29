import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { AttendanceStatus } from '@aiplatform/contracts'
import { SUPER_ADMIN_PERMISSION } from '@aiplatform/contracts'
import {
  DuplicateEmailError,
  DuplicateEmployeeFieldError,
  LastActiveSuperAdminError,
  type AdminEmployeeCreateRecord,
  type AdminEmployeeListQuery,
  type AdminEmployeeRecord,
  type AdminEmployeeUpdateRecord,
  type AdminRoleRecord,
  type AttendanceDayRecord,
  type CompanyRecord,
  type DepartmentRecord,
  type DuplicateEmployeeField,
  type IdentityRepository,
  type LoginCandidate,
  type MemberRecord,
  type PermissionRecord,
  type ProfileRecord,
  type ProfileUpdateRecord,
  type RoleRefRecord,
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

interface PermissionRow extends RowDataPacket {
  code: string
}

interface PermissionIdRow extends RowDataPacket {
  id: string
  code: string
}

interface RolePermissionTargetRow extends RowDataPacket {
  id: string
  has_super_admin: number | boolean | string
}

interface AdminEmployeeRow extends RowDataPacket {
  id: string
  tenant_id: string
  public_id: string
  username: string
  employee_no: string
  display_name: string
  position: string | null
  phone: string | null
  email: string
  status: string
  created_at: Date
  updated_at: Date
  company_public_id: string
  company_code: string
  company_name: string
  company_status: string
  department_id: string | null
  department_name: string | null
}

interface AdminEmployeeRoleRow extends RowDataPacket {
  employee_id: string
  role_code: string
  role_name: string
}

interface CompanyRow extends RowDataPacket {
  id: string
  public_id: string
  company_code: string
  name: string
  status: string
}

interface PositionRow extends RowDataPacket {
  position: string
}

interface IdRow extends RowDataPacket {
  id: string
}

interface CountRow extends RowDataPacket {
  total: string | number
}

interface RoleRefRow extends RowDataPacket {
  id: string
  code: string
  name: string
  has_super_admin: string | number
}

interface EmployeeStatusRow extends RowDataPacket {
  status: string
}

interface AdminRoleRow extends RowDataPacket {
  id: string
  code: string
  name: string
  description: string | null
  member_count: string | number
}

interface AdminRolePermissionRow extends RowDataPacket {
  role_id: string
  code: string
}

interface PermissionCatalogRow extends RowDataPacket {
  code: string
  description: string | null
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

/** 从 MySQL 唯一键错误中识别员工冲突字段 */
function duplicateEmployeeField(error: unknown): DuplicateEmployeeField | null {
  if (!isDuplicateEntry(error)) return null

  const message =
    typeof error === 'object' && error !== null
      ? String(
          (error as { sqlMessage?: unknown; message?: unknown }).sqlMessage ??
            (error as { message?: unknown }).message ??
            '',
        )
      : ''

  if (message.includes('uk_employees_tenant_username')) return 'username'
  if (message.includes('uk_employees_tenant_email')) return 'email'
  if (message.includes('uk_employees_tenant_employee_no')) return 'employeeNo'
  return null
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

const EMPLOYEE_SELECT = `SELECT e.id,
       e.tenant_id,
       e.public_id,
       e.username,
       e.employee_no,
       e.display_name,
       e.position,
       e.phone,
       e.email,
       e.status,
       e.created_at,
       e.updated_at,
       c.public_id   AS company_public_id,
       c.company_code,
       c.name        AS company_name,
       c.status      AS company_status,
       d.id          AS department_id,
       d.name        AS department_name`

const EMPLOYEE_FROM = `FROM employees e
       JOIN companies c
         ON c.id = e.tenant_id
        AND c.deleted_at IS NULL
       LEFT JOIN (
         SELECT m2.tenant_id, m2.employee_id, MIN(m2.id) AS membership_id
           FROM employee_department_memberships m2
          WHERE m2.is_primary = 1
          GROUP BY m2.tenant_id, m2.employee_id
       ) pm
         ON pm.tenant_id = e.tenant_id
        AND pm.employee_id = e.id
       LEFT JOIN employee_department_memberships m
         ON m.id = pm.membership_id
       LEFT JOIN departments d
         ON d.tenant_id = e.tenant_id
        AND d.id = m.department_id
        AND d.deleted_at IS NULL`

function buildEmployeeWhere(
  tenantId: string | null,
  query: AdminEmployeeListQuery,
): { sql: string; params: SqlParam[] } {
  const clauses = ['e.deleted_at IS NULL']
  const params: SqlParam[] = []

  if (tenantId !== null) {
    clauses.push('e.tenant_id = ?')
    params.push(tenantId)
  }
  if (query.departmentId) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM employee_department_memberships mf
       WHERE mf.tenant_id = e.tenant_id
         AND mf.employee_id = e.id
         AND mf.department_id = ?
         AND mf.is_primary = 1
    )`)
    params.push(query.departmentId)
  }
  if (query.position) {
    clauses.push('e.position = ?')
    params.push(query.position)
  }
  if (query.status) {
    clauses.push('e.status = ?')
    params.push(query.status)
  }
  if (query.keyword) {
    const like = `%${query.keyword}%`
    clauses.push(
      '(e.display_name LIKE ? OR e.username LIKE ? OR e.employee_no LIKE ? OR e.email LIKE ?)',
    )
    params.push(like, like, like, like)
  }

  return { sql: `WHERE ${clauses.join(' AND ')}`, params }
}

function toCompanyRecord(row: CompanyRow): CompanyRecord {
  return {
    tenantId: row.id,
    publicId: row.public_id,
    code: row.company_code,
    name: row.name,
    status: row.status,
  }
}

function toAdminEmployeeRecord(
  row: AdminEmployeeRow,
  roles: Array<{ code: string; name: string }>,
): AdminEmployeeRecord {
  return {
    tenantId: row.tenant_id,
    employeeId: row.id,
    publicId: row.public_id,
    company: {
      tenantId: row.tenant_id,
      publicId: row.company_public_id,
      code: row.company_code,
      name: row.company_name,
      status: row.company_status,
    },
    username: row.username,
    employeeNo: row.employee_no,
    name: row.display_name,
    position: row.position,
    phone: row.phone,
    email: row.email,
    departmentId: row.department_id,
    department: row.department_name,
    status: row.status,
    roles,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

/** 批量查询员工角色，按员工 ID 聚合 */
async function loadEmployeeRoles(
  pool: Pool,
  employeeIds: string[],
): Promise<Map<string, Array<{ code: string; name: string }>>> {
  if (employeeIds.length === 0) return new Map()

  const placeholders = employeeIds.map(() => '?').join(', ')
  const [rows] = await pool.execute<AdminEmployeeRoleRow[]>(
    `SELECT er.employee_id,
            r.code AS role_code,
            r.name AS role_name
       FROM employee_roles er
       JOIN roles r
         ON r.tenant_id = er.tenant_id
        AND r.id = er.role_id
        AND r.deleted_at IS NULL
      WHERE er.employee_id IN (${placeholders})
      ORDER BY r.name`,
    employeeIds,
  )

  const rolesByEmployee = new Map<string, Array<{ code: string; name: string }>>()
  for (const row of rows) {
    const roles = rolesByEmployee.get(row.employee_id) ?? []
    roles.push({ code: row.role_code, name: row.role_name })
    rolesByEmployee.set(row.employee_id, roles)
  }
  return rolesByEmployee
}

/** 员工当前是否通过任一角色持有超级管理员权限 */
async function employeeHasSuperAdminPermission(
  connection: PoolConnection,
  tenantId: string,
  employeeId: string,
): Promise<boolean> {
  const [rows] = await connection.execute<IdRow[]>(
    `SELECT 1
       FROM employee_roles er
       JOIN roles r
         ON r.tenant_id = er.tenant_id
        AND r.id = er.role_id
        AND r.deleted_at IS NULL
       JOIN role_permissions rp
         ON rp.role_id = r.id
       JOIN permissions p
         ON p.id = rp.permission_id
      WHERE er.tenant_id = ?
        AND er.employee_id = ?
        AND p.code = ?
      LIMIT 1`,
    [tenantId, employeeId, SUPER_ADMIN_PERMISSION],
  )
  return rows.length > 0
}

/** 给定的角色 ID 中是否至少有一个授予超级管理员权限 */
async function roleIdsGrantSuperAdmin(
  connection: PoolConnection,
  tenantId: string,
  roleIds: readonly string[],
): Promise<boolean> {
  if (roleIds.length === 0) return false

  const placeholders = roleIds.map(() => '?').join(', ')
  const [rows] = await connection.execute<IdRow[]>(
    `SELECT DISTINCT r.id
       FROM roles r
       JOIN role_permissions rp
         ON rp.role_id = r.id
       JOIN permissions p
         ON p.id = rp.permission_id
      WHERE r.tenant_id = ?
        AND r.id IN (${placeholders})
        AND r.deleted_at IS NULL
        AND p.code = ?`,
    [tenantId, ...roleIds, SUPER_ADMIN_PERMISSION],
  )
  return rows.length > 0
}

interface SuperAdminRemovalIntent {
  /** 修改后的员工状态；undefined 表示保持不变 */
  status?: string
  /** 修改后的角色 ID；undefined 表示不修改角色 */
  roleIds?: readonly string[]
  /** 是否为删除操作 */
  deleting?: boolean
}

/**
 * 在写事务内校验本次操作不会移除平台最后一个可用的超级管理员。
 *
 * 仅把“计数”和“写入”包进事务并不能消除竞态：两个事务仍可能读到相同的
 * 剩余数量。这里先对平台企业行执行 SELECT ... FOR UPDATE，把它作为该租户
 * 超级管理员变更的串行化锁；所有可能移除超管的写路径都必须经过本函数，
 * 后到的事务会等待前一个事务提交后再计数，从而看到最新的角色/状态。
 *
 * 必须在事务内、且在业务写入之前调用，保证锁的获取先于任何快照读取。
 */
async function assertSuperAdminRemovalAllowed(
  connection: PoolConnection,
  tenantId: string,
  employeeId: string,
  next: SuperAdminRemovalIntent,
): Promise<void> {
  // 以平台企业行作为租户级互斥锁（InnoDB 行锁，随事务提交/回滚释放）
  const [companyRows] = await connection.execute<IdRow[]>(
    `SELECT id
       FROM companies
      WHERE id = ?
        AND deleted_at IS NULL
      FOR UPDATE`,
    [tenantId],
  )
  if (companyRows.length === 0) {
    throw new Error('平台企业不存在，无法校验超级管理员约束')
  }

  const [statusRows] = await connection.execute<EmployeeStatusRow[]>(
    `SELECT status
       FROM employees
      WHERE tenant_id = ?
        AND id = ?
        AND deleted_at IS NULL
      FOR UPDATE`,
    [tenantId, employeeId],
  )

  const current = statusRows.at(0)
  // 目标已不存在：后续写入自然为空操作，无需阻断
  if (!current) return
  if (current.status !== 'active') return

  // 所有可能移除超管的角色/状态写入都会先获取上面的企业行锁，因此这里
  // 读到的权限归属不会与其他移除操作交错；并发的新增授权即使尚未提交，
  // 也只会让本次校验更保守（宁可误拦，不会误放）。
  const isSuperAdmin = await employeeHasSuperAdminPermission(
    connection,
    tenantId,
    employeeId,
  )
  if (!isSuperAdmin) return

  const nextStatus = next.status ?? current.status
  const willBeActive = next.deleting ? false : nextStatus === 'active'
  const willKeepSuperAdmin =
    next.roleIds === undefined
      ? true
      : await roleIdsGrantSuperAdmin(connection, tenantId, next.roleIds)
  if (willBeActive && willKeepSuperAdmin) return

  // 同一事务内完成剩余数量校验；企业行锁保证没有其他移除操作并发提交
  const [countRows] = await connection.execute<CountRow[]>(
    `SELECT COUNT(DISTINCT e.id) AS total
       FROM employees e
       JOIN employee_roles er
         ON er.tenant_id = e.tenant_id
        AND er.employee_id = e.id
       JOIN roles r
         ON r.tenant_id = er.tenant_id
        AND r.id = er.role_id
        AND r.deleted_at IS NULL
       JOIN role_permissions rp
         ON rp.role_id = r.id
       JOIN permissions p
         ON p.id = rp.permission_id
      WHERE e.tenant_id = ?
        AND e.deleted_at IS NULL
        AND e.status = 'active'
        AND p.code = ?
        AND e.id <> ?`,
    [tenantId, SUPER_ADMIN_PERMISSION, employeeId],
  )
  if (Number(countRows.at(0)?.total ?? 0) === 0) {
    throw new LastActiveSuperAdminError()
  }
}

/** MySQL 实现：只负责数据访问，不做业务判定 */
export function createMySqlIdentityRepository(pool: Pool): IdentityRepository {
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

      const [permissionRows] = await pool.execute<PermissionRow[]>(
        `SELECT DISTINCT p.code
           FROM employee_roles er
           JOIN roles r
             ON r.tenant_id = er.tenant_id
            AND r.id = er.role_id
            AND r.deleted_at IS NULL
           JOIN role_permissions rp
             ON rp.role_id = r.id
           JOIN permissions p
             ON p.id = rp.permission_id
          WHERE er.tenant_id = ?
            AND er.employee_id = ?
          ORDER BY p.code`,
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
        permissionCodes: permissionRows.map((row) => row.code),
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

    async findCompanyIdByCode(code) {
      const [rows] = await pool.execute<IdRow[]>(
        `SELECT id
           FROM companies
          WHERE company_code = ?
            AND deleted_at IS NULL
          LIMIT 1`,
        [code],
      )
      return rows.at(0)?.id ?? null
    },

    async listCompanies(tenantId) {
      const params: SqlParam[] = []
      let tenantClause = ''
      if (tenantId !== null) {
        tenantClause = 'AND id = ?'
        params.push(tenantId)
      }

      const [rows] = await pool.execute<CompanyRow[]>(
        `SELECT id, public_id, company_code, name, status
           FROM companies
          WHERE deleted_at IS NULL
            ${tenantClause}
          ORDER BY name, id`,
        params,
      )
      return rows.map(toCompanyRecord)
    },

    async listPositions(tenantId) {
      const [rows] = await pool.execute<PositionRow[]>(
        `SELECT DISTINCT position
           FROM employees
          WHERE tenant_id = ?
            AND deleted_at IS NULL
            AND position IS NOT NULL
            AND position <> ''
          ORDER BY position`,
        [tenantId],
      )
      return rows.map((row) => row.position)
    },

    async findDepartmentInTenant(tenantId, departmentId) {
      const [rows] = await pool.execute<IdRow[]>(
        `SELECT id
           FROM departments
          WHERE tenant_id = ?
            AND id = ?
            AND deleted_at IS NULL
          LIMIT 1`,
        [tenantId, departmentId],
      )
      return rows.length > 0
    },

    async findRolesByCodes(tenantId, codes) {
      if (codes.length === 0) return []

      const placeholders = codes.map(() => '?').join(', ')
      const [rows] = await pool.execute<RoleRefRow[]>(
        `SELECT r.id,
                r.code,
                r.name,
                MAX(CASE WHEN p.code = ? THEN 1 ELSE 0 END) AS has_super_admin
           FROM roles r
           LEFT JOIN role_permissions rp
             ON rp.role_id = r.id
           LEFT JOIN permissions p
             ON p.id = rp.permission_id
          WHERE r.tenant_id = ?
            AND r.deleted_at IS NULL
            AND r.code IN (${placeholders})
          GROUP BY r.id, r.code, r.name
          ORDER BY r.name`,
        [SUPER_ADMIN_PERMISSION, tenantId, ...codes],
      )

      return rows.map<RoleRefRecord>((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        hasSuperAdmin: Number(row.has_super_admin) === 1,
      }))
    },

    async listAdminEmployees(tenantId, query) {
      const where = buildEmployeeWhere(tenantId, query)

      const [countRows] = await pool.execute<CountRow[]>(
        `SELECT COUNT(DISTINCT e.id) AS total
           ${EMPLOYEE_FROM}
           ${where.sql}`,
        where.params,
      )

      const [rows] = await pool.execute<AdminEmployeeRow[]>(
        `${EMPLOYEE_SELECT}
           ${EMPLOYEE_FROM}
           ${where.sql}
         ORDER BY c.name, e.display_name, e.id
         LIMIT ? OFFSET ?`,
        [...where.params, query.pageSize, (query.page - 1) * query.pageSize],
      )

      const rolesByEmployee = await loadEmployeeRoles(
        pool,
        rows.map((row) => row.id),
      )

      return {
        items: rows.map((row) =>
          toAdminEmployeeRecord(row, rolesByEmployee.get(row.id) ?? []),
        ),
        total: Number(countRows.at(0)?.total ?? 0),
      }
    },

    async findAdminEmployee(tenantId, publicId) {
      const clauses = ['e.deleted_at IS NULL', 'e.public_id = ?']
      const params: SqlParam[] = [publicId]
      if (tenantId !== null) {
        clauses.push('e.tenant_id = ?')
        params.push(tenantId)
      }

      const [rows] = await pool.execute<AdminEmployeeRow[]>(
        `${EMPLOYEE_SELECT}
           ${EMPLOYEE_FROM}
          WHERE ${clauses.join(' AND ')}
          LIMIT 1`,
        params,
      )

      const row = rows.at(0)
      if (!row) return null

      const rolesByEmployee = await loadEmployeeRoles(pool, [row.id])
      return toAdminEmployeeRecord(row, rolesByEmployee.get(row.id) ?? [])
    },

    async createAdminEmployee(tenantId, record) {
      try {
        await withTransaction(async (connection) => {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO employees
               (tenant_id, public_id, employee_no, username, email,
                display_name, position, phone, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [
              tenantId,
              record.publicId,
              record.employeeNo,
              record.username,
              record.email,
              record.name,
              record.position,
              record.phone,
            ],
          )
          const employeeId = String(result.insertId)

          await connection.execute(
            `INSERT INTO employee_credentials
               (tenant_id, employee_id, credential_type, password_hash, password_updated_at)
             VALUES (?, ?, 'password', ?, UTC_TIMESTAMP(3))`,
            [tenantId, employeeId, record.passwordHash],
          )

          if (record.departmentId) {
            await connection.execute(
              `INSERT INTO employee_department_memberships
                 (tenant_id, employee_id, department_id, is_primary)
               VALUES (?, ?, ?, 1)`,
              [tenantId, employeeId, record.departmentId],
            )
          }

          for (const roleId of record.roleIds) {
            await connection.execute(
              `INSERT INTO employee_roles (tenant_id, employee_id, role_id)
               VALUES (?, ?, ?)`,
              [tenantId, employeeId, roleId],
            )
          }
        })
      } catch (error) {
        const field = duplicateEmployeeField(error)
        if (field) throw new DuplicateEmployeeFieldError(field)
        throw error
      }
    },

    async updateAdminEmployee(tenantId, employeeId, changes, options) {
      try {
        await withTransaction(async (connection) => {
          // 串行化锁必须在本事务任何其他读取/写入之前获取
          if (options?.protectLastActiveSuperAdmin) {
            await assertSuperAdminRemovalAllowed(connection, tenantId, employeeId, {
              status: changes.status,
              roleIds: changes.roleIds,
            })
          }

          const assignments: string[] = []
          const params: SqlParam[] = []

          if (changes.name !== undefined) {
            assignments.push('display_name = ?')
            params.push(changes.name)
          }
          if (changes.email !== undefined) {
            assignments.push('email = ?')
            params.push(changes.email)
          }
          if (changes.position !== undefined) {
            assignments.push('position = ?')
            params.push(changes.position)
          }
          if (changes.phone !== undefined) {
            assignments.push('phone = ?')
            params.push(changes.phone)
          }
          if (changes.status !== undefined) {
            assignments.push('status = ?')
            params.push(changes.status)
          }

          if (assignments.length > 0) {
            params.push(tenantId, employeeId)
            await connection.execute(
              `UPDATE employees
                  SET ${assignments.join(', ')},
                      updated_at = CURRENT_TIMESTAMP(3)
                WHERE tenant_id = ?
                  AND id = ?
                  AND deleted_at IS NULL`,
              params,
            )
          }

          if (changes.departmentId !== undefined) {
            await connection.execute(
              `UPDATE employee_department_memberships
                  SET is_primary = 0
                WHERE tenant_id = ?
                  AND employee_id = ?`,
              [tenantId, employeeId],
            )

            if (changes.departmentId !== null) {
              await connection.execute(
                `INSERT INTO employee_department_memberships
                   (tenant_id, employee_id, department_id, is_primary)
                 VALUES (?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE is_primary = 1`,
                [tenantId, employeeId, changes.departmentId],
              )
            }
          }

          if (changes.roleIds !== undefined) {
            await connection.execute(
              `DELETE FROM employee_roles
                WHERE tenant_id = ?
                  AND employee_id = ?`,
              [tenantId, employeeId],
            )

            for (const roleId of changes.roleIds) {
              await connection.execute(
                `INSERT INTO employee_roles (tenant_id, employee_id, role_id)
                 VALUES (?, ?, ?)`,
                [tenantId, employeeId, roleId],
              )
            }
          }
        })
      } catch (error) {
        const field = duplicateEmployeeField(error)
        if (field) throw new DuplicateEmployeeFieldError(field)
        throw error
      }
    },

    async softDeleteAdminEmployee(tenantId, employeeId, options) {
      await withTransaction(async (connection) => {
        // 删除同样必须与“剩余超管”校验共用同一事务和同一把租户锁
        if (options?.protectLastActiveSuperAdmin) {
          await assertSuperAdminRemovalAllowed(connection, tenantId, employeeId, {
            deleting: true,
          })
        }

        await connection.execute(
          `UPDATE employees
              SET status = 'disabled',
                  deleted_at = UTC_TIMESTAMP(3),
                  updated_at = UTC_TIMESTAMP(3)
            WHERE tenant_id = ?
              AND id = ?
              AND deleted_at IS NULL`,
          [tenantId, employeeId],
        )
      })
    },

    async listAdminRoles(tenantId) {
      const [roleRows] = await pool.execute<AdminRoleRow[]>(
        `SELECT r.id,
                r.code,
                r.name,
                r.description,
                COUNT(DISTINCT e.id) AS member_count
           FROM roles r
           LEFT JOIN employee_roles er
             ON er.tenant_id = r.tenant_id
            AND er.role_id = r.id
           LEFT JOIN employees e
             ON e.tenant_id = er.tenant_id
            AND e.id = er.employee_id
            AND e.deleted_at IS NULL
          WHERE r.tenant_id = ?
            AND r.deleted_at IS NULL
          GROUP BY r.id, r.code, r.name, r.description
          ORDER BY r.name`,
        [tenantId],
      )

      const [permissionRows] = await pool.execute<AdminRolePermissionRow[]>(
        `SELECT rp.role_id,
                p.code
           FROM role_permissions rp
           JOIN roles r
             ON r.id = rp.role_id
            AND r.tenant_id = ?
            AND r.deleted_at IS NULL
           JOIN permissions p
             ON p.id = rp.permission_id
          ORDER BY p.code`,
        [tenantId],
      )

      const permissionsByRole = new Map<string, string[]>()
      for (const row of permissionRows) {
        const codes = permissionsByRole.get(row.role_id) ?? []
        codes.push(row.code)
        permissionsByRole.set(row.role_id, codes)
      }

      return roleRows.map<AdminRoleRecord>((row) => ({
        code: row.code,
        name: row.name,
        description: row.description,
        memberCount: Number(row.member_count),
        permissions: permissionsByRole.get(row.id) ?? [],
      }))
    },

    async listPermissions() {
      const [rows] = await pool.execute<PermissionCatalogRow[]>(
        `SELECT code, description
           FROM permissions
          ORDER BY code`,
      )

      return rows.map<PermissionRecord>((row) => ({
        code: row.code,
        description: row.description,
      }))
    },

    async updateAdminRolePermissions(tenantId, roleCode, permissionCodes) {
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        const [roles] = await connection.execute<RolePermissionTargetRow[]>(
          `SELECT r.id,
                  EXISTS (
                    SELECT 1
                      FROM role_permissions rp
                      JOIN permissions p ON p.id = rp.permission_id
                     WHERE rp.role_id = r.id
                       AND p.code = 'system.super_admin'
                  ) AS has_super_admin
             FROM roles r
            WHERE r.tenant_id = ? AND r.code = ? AND r.deleted_at IS NULL
            LIMIT 1 FOR UPDATE`,
          [tenantId, roleCode],
        )
        const role = roles.at(0)
        if (
          !role ||
          role.has_super_admin === true ||
          role.has_super_admin === 1 ||
          role.has_super_admin === '1'
        ) {
          await connection.rollback()
          return false
        }

        let permissionIds: string[] = []
        if (permissionCodes.length > 0) {
          const placeholders = permissionCodes.map(() => '?').join(', ')
          const [permissions] = await connection.execute<PermissionIdRow[]>(
            `SELECT id, code FROM permissions WHERE code IN (${placeholders})`,
            permissionCodes,
          )
          if (permissions.length !== permissionCodes.length) {
            await connection.rollback()
            return false
          }
          permissionIds = permissions.map((permission) => permission.id)
        }

        await connection.execute('DELETE FROM role_permissions WHERE role_id = ?', [role.id])
        if (permissionIds.length > 0) {
          const values = permissionIds.map(() => '(?, ?)').join(', ')
          const parameters = permissionIds.flatMap((permissionId) => [role.id, permissionId])
          await connection.execute(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES ${values}`,
            parameters,
          )
        }

        await connection.commit()
        return true
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },
  }
}
