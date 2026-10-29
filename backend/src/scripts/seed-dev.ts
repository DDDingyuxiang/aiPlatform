/**
 * 本地开发种子数据（仅用于开发/测试，不参与生产部署）。
 *
 * 前置条件：已执行 scripts/database/mysql 下的初始化脚本。
 * 密码来自 SEED_ADMIN_PASSWORD，不写入代码与版本库。
 */
import { ulid } from 'ulid'
import {
  ANNOUNCEMENT_PUBLISH_PERMISSION,
  EMPLOYEE_MANAGE_PERMISSION,
  SUPER_ADMIN_PERMISSION,
} from '@aiplatform/contracts'
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { loadEnvFile } from '../config/env.js'
import { loadAppConfig } from '../config/index.js'
import { createDatabasePool } from '../infra/db.js'
import { PLATFORM_COMPANY_CODE, hashPassword } from '../modules/identity/index.js'
import { resolveDateInTimeZone, resolveMonthRange } from '../shared/month-range.js'

interface IdRow extends RowDataPacket {
  id: string
}

type SqlParam = string | number | null

async function findId(
  connection: PoolConnection,
  sql: string,
  params: SqlParam[],
): Promise<string | null> {
  const [rows] = await connection.execute<IdRow[]>(sql, params)
  return rows.at(0)?.id ?? null
}

async function ensureCompany(
  connection: PoolConnection,
  companyCode: string,
  companyName: string,
): Promise<string> {
  const existing = await findId(
    connection,
    'SELECT id FROM companies WHERE company_code = ? AND deleted_at IS NULL LIMIT 1',
    [companyCode],
  )
  if (existing) return existing

  await connection.execute(
    `INSERT INTO companies (public_id, company_code, name, status)
     VALUES (?, ?, ?, 'active')`,
    [ulid(), companyCode, companyName],
  )
  const created = await findId(
    connection,
    'SELECT id FROM companies WHERE company_code = ? LIMIT 1',
    [companyCode],
  )
  if (!created) throw new Error('创建演示企业失败')
  return created
}

async function ensureDepartment(
  connection: PoolConnection,
  tenantId: string,
  name: string,
): Promise<string> {
  const existing = await findId(
    connection,
    'SELECT id FROM departments WHERE tenant_id = ? AND name = ? AND deleted_at IS NULL LIMIT 1',
    [tenantId, name],
  )
  if (existing) return existing

  await connection.execute(
    `INSERT INTO departments (tenant_id, name, status)
     VALUES (?, ?, 'active')`,
    [tenantId, name],
  )
  const created = await findId(
    connection,
    'SELECT id FROM departments WHERE tenant_id = ? AND name = ? LIMIT 1',
    [tenantId, name],
  )
  if (!created) throw new Error('创建演示部门失败')
  return created
}

async function ensureRole(
  connection: PoolConnection,
  tenantId: string,
  code: string,
  name: string,
): Promise<string> {
  const existing = await findId(
    connection,
    'SELECT id FROM roles WHERE tenant_id = ? AND code = ? AND deleted_at IS NULL LIMIT 1',
    [tenantId, code],
  )
  if (existing) return existing

  await connection.execute(
    `INSERT INTO roles (tenant_id, code, name)
     VALUES (?, ?, ?)`,
    [tenantId, code, name],
  )
  const created = await findId(
    connection,
    'SELECT id FROM roles WHERE tenant_id = ? AND code = ? LIMIT 1',
    [tenantId, code],
  )
  if (!created) throw new Error('创建演示角色失败')
  return created
}

async function ensurePermission(
  connection: PoolConnection,
  code: string,
  description: string,
): Promise<string> {
  const existing = await findId(
    connection,
    'SELECT id FROM permissions WHERE code = ? LIMIT 1',
    [code],
  )
  if (existing) return existing

  await connection.execute(
    `INSERT INTO permissions (code, description)
     VALUES (?, ?)`,
    [code, description],
  )
  const created = await findId(connection, 'SELECT id FROM permissions WHERE code = ? LIMIT 1', [
    code,
  ])
  if (!created) throw new Error('创建演示权限失败')
  return created
}

async function ensureRolePermission(
  connection: PoolConnection,
  roleId: string,
  permissionId: string,
): Promise<void> {
  const existing = await findId(
    connection,
    'SELECT id FROM role_permissions WHERE role_id = ? AND permission_id = ? LIMIT 1',
    [roleId, permissionId],
  )
  if (existing) return

  await connection.execute(
    `INSERT INTO role_permissions (role_id, permission_id)
     VALUES (?, ?)`,
    [roleId, permissionId],
  )
}

/** 为演示企业补齐默认审批模板；已有启用流程不覆盖。 */
async function ensureDefaultApprovalWorkflows(
  connection: PoolConnection,
  tenantId: string,
  createdBy: string,
  approverRoleId: string,
): Promise<void> {
  const definitions = [
    { type: 'expense', code: 'expense', name: '费用报销审批' },
    { type: 'leave', code: 'leave', name: '请假审批' },
    { type: 'purchase', code: 'purchase', name: '采购审批' },
    { type: 'contract', code: 'contract', name: '合同审批' },
  ] as const

  for (const definition of definitions) {
    const activeId = await findId(
      connection,
      `SELECT id FROM workflow_definitions
        WHERE tenant_id = ? AND code = ? AND status = 'active' AND deleted_at IS NULL
        ORDER BY version DESC LIMIT 1`,
      [tenantId, definition.code],
    )
    if (activeId) continue

    const [versionRows] = await connection.execute<
      Array<RowDataPacket & { max_version: number | null }>
    >(
      'SELECT MAX(version) AS max_version FROM workflow_definitions WHERE tenant_id = ? AND code = ?',
      [tenantId, definition.code],
    )
    const version = Number(versionRows.at(0)?.max_version ?? 0) + 1
    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO workflow_definitions
         (tenant_id, public_id, code, name, approval_type, version, description, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        tenantId,
        ulid(),
        definition.code,
        definition.name,
        definition.type,
        version,
        '默认由本企业管理员角色审批，可在后续版本中调整流程。',
        createdBy,
      ],
    )
    await connection.execute(
      `INSERT INTO workflow_definition_nodes
         (tenant_id, workflow_definition_id, node_key, node_name, sequence_no,
          approver_type, approver_ref_id, approval_mode)
       VALUES (?, ?, 'admin_review', '管理员审批', 1, 'role', ?, 'any')`,
      [tenantId, String(insert.insertId), approverRoleId],
    )
  }
}

interface SeedEmployee {
  username: string
  employeeNo: string
  email: string
  displayName: string
  position: string
  phone: string
}

async function ensureEmployee(
  connection: PoolConnection,
  tenantId: string,
  passwordHash: string,
  employee: SeedEmployee,
): Promise<string> {
  let employeeId = await findId(
    connection,
    'SELECT id FROM employees WHERE tenant_id = ? AND username = ? AND deleted_at IS NULL LIMIT 1',
    [tenantId, employee.username],
  )

  if (!employeeId) {
    await connection.execute(
      `INSERT INTO employees
         (tenant_id, public_id, employee_no, username, email, display_name, position, phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        tenantId,
        ulid(),
        employee.employeeNo,
        employee.username,
        employee.email,
        employee.displayName,
        employee.position,
        employee.phone,
      ],
    )
    employeeId = await findId(
      connection,
      'SELECT id FROM employees WHERE tenant_id = ? AND username = ? LIMIT 1',
      [tenantId, employee.username],
    )
    if (!employeeId) throw new Error(`创建演示员工失败：${employee.username}`)
  }

  const credentialId = await findId(
    connection,
    `SELECT id FROM employee_credentials
      WHERE employee_id = ? AND credential_type = 'password' LIMIT 1`,
    [employeeId],
  )

  if (credentialId) {
    await connection.execute(
      `UPDATE employee_credentials
          SET password_hash = ?, password_updated_at = UTC_TIMESTAMP(3)
        WHERE id = ?`,
      [passwordHash, credentialId],
    )
  } else {
    await connection.execute(
      `INSERT INTO employee_credentials
         (tenant_id, employee_id, credential_type, password_hash, password_updated_at)
       VALUES (?, ?, 'password', ?, UTC_TIMESTAMP(3))`,
      [tenantId, employeeId, passwordHash],
    )
  }

  return employeeId
}

async function ensureMembership(
  connection: PoolConnection,
  tenantId: string,
  employeeId: string,
  departmentId: string,
): Promise<void> {
  const membershipId = await findId(
    connection,
    `SELECT id FROM employee_department_memberships
      WHERE tenant_id = ? AND employee_id = ? AND department_id = ? LIMIT 1`,
    [tenantId, employeeId, departmentId],
  )

  if (membershipId) {
    await connection.execute(
      'UPDATE employee_department_memberships SET is_primary = 1 WHERE id = ?',
      [membershipId],
    )
    return
  }

  await connection.execute(
    `INSERT INTO employee_department_memberships
       (tenant_id, employee_id, department_id, is_primary)
     VALUES (?, ?, ?, 1)`,
    [tenantId, employeeId, departmentId],
  )
}

/** 为当月工作日补充演示考勤（幂等：依赖 tenant_id + employee_id + work_date 唯一键） */
async function ensureAttendance(
  connection: PoolConnection,
  tenantId: string,
  employeeId: string,
  timezone: string,
): Promise<number> {
  const now = new Date()
  const today = resolveDateInTimeZone(timezone, now)
  const { month } = resolveMonthRange(timezone, now)
  const lastDay = Number(today.slice(8, 10))
  let weekdays = 0

  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (weekday === 0 || weekday === 6) continue

    await connection.execute(
      `INSERT IGNORE INTO attendance_records
         (tenant_id, employee_id, work_date, status, source)
       VALUES (?, ?, ?, 'normal', 'import')`,
      [tenantId, employeeId, date],
    )
    weekdays += 1
  }

  return weekdays
}

async function ensureEmployeeRole(
  connection: PoolConnection,
  tenantId: string,
  employeeId: string,
  roleId: string,
): Promise<void> {
  const existing = await findId(
    connection,
    `SELECT id FROM employee_roles
      WHERE tenant_id = ? AND employee_id = ? AND role_id = ? LIMIT 1`,
    [tenantId, employeeId, roleId],
  )
  if (existing) return

  await connection.execute(
    `INSERT INTO employee_roles (tenant_id, employee_id, role_id)
     VALUES (?, ?, ?)`,
    [tenantId, employeeId, roleId],
  )
}

async function main(): Promise<void> {
  loadEnvFile()
  const config = loadAppConfig()

  const password = process.env.SEED_ADMIN_PASSWORD
  if (!password || password.length < 8) {
    throw new Error('请通过 SEED_ADMIN_PASSWORD 设置至少 8 位的种子账号密码')
  }

  const companyCode = process.env.SEED_COMPANY_CODE ?? 'demo'
  const companyName = process.env.SEED_COMPANY_NAME ?? '演示企业'
  const passwordHash = await hashPassword(password)
  const pool = createDatabasePool(config.database)
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const demoTenantId = await ensureCompany(connection, companyCode, companyName)
    const platformTenantId = await ensureCompany(
      connection,
      PLATFORM_COMPANY_CODE,
      '平台管理',
    )
    const demoDepartmentId = await ensureDepartment(connection, demoTenantId, '综合管理部')
    const platformDepartmentId = await ensureDepartment(
      connection,
      platformTenantId,
      '平台管理部',
    )

    const employeeManagePermissionId = await ensurePermission(
      connection,
      EMPLOYEE_MANAGE_PERMISSION,
      '本企业员工管理（不跨公司）',
    )
    const announcementPublishPermissionId = await ensurePermission(
      connection,
      ANNOUNCEMENT_PUBLISH_PERMISSION,
      '本企业公告发布（不跨公司）',
    )
    const superAdminPermissionId = await ensurePermission(
      connection,
      SUPER_ADMIN_PERMISSION,
      '超级管理员权限（拥有全部权限）',
    )

    const adminRoleId = await ensureRole(connection, demoTenantId, 'admin', '管理员')
    const employeeRoleId = await ensureRole(connection, demoTenantId, 'employee', '员工')
    await ensureRolePermission(connection, adminRoleId, employeeManagePermissionId)
    await ensureRolePermission(connection, adminRoleId, announcementPublishPermissionId)

    // 兼容上一版种子：演示公司不再拥有 super_admin 角色，避免角色展示与权限语义混淆
    const legacySuperAdminRoleId = await findId(
      connection,
      'SELECT id FROM roles WHERE tenant_id = ? AND code = ? LIMIT 1',
      [demoTenantId, 'super_admin'],
    )
    if (legacySuperAdminRoleId) {
      await connection.execute(
        'DELETE FROM employee_roles WHERE tenant_id = ? AND role_id = ?',
        [demoTenantId, legacySuperAdminRoleId],
      )
      await connection.execute(
        'UPDATE roles SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ? AND deleted_at IS NULL',
        [legacySuperAdminRoleId],
      )
    }

    const superAdminRoleId = await ensureRole(
      connection,
      platformTenantId,
      'super_admin',
      '超级管理员',
    )
    await ensureRolePermission(connection, superAdminRoleId, superAdminPermissionId)

    const adminEmployeeId = await ensureEmployee(connection, demoTenantId, passwordHash, {
      username: 'admin',
      employeeNo: 'E1001',
      email: 'admin@example.com',
      displayName: '王立',
      position: '数字化平台主管',
      phone: '13800001001',
    })
    await ensureMembership(connection, demoTenantId, adminEmployeeId, demoDepartmentId)
    await ensureEmployeeRole(connection, demoTenantId, adminEmployeeId, adminRoleId)
    await ensureDefaultApprovalWorkflows(
      connection,
      demoTenantId,
      adminEmployeeId,
      adminRoleId,
    )

    const demoEmployeeId = await ensureEmployee(connection, demoTenantId, passwordHash, {
      username: 'employee',
      employeeNo: 'E1002',
      email: 'employee@example.com',
      displayName: '演示员工',
      position: '业务专员',
      phone: '13800001002',
    })
    await ensureMembership(connection, demoTenantId, demoEmployeeId, demoDepartmentId)
    await ensureEmployeeRole(connection, demoTenantId, demoEmployeeId, employeeRoleId)

    const platformAdminEmployeeId = await ensureEmployee(
      connection,
      platformTenantId,
      passwordHash,
      {
        username: 'superadmin',
        employeeNo: 'P0001',
        email: 'superadmin@example.com',
        displayName: '平台管理员',
        position: '平台超级管理员',
        phone: '13800000000',
      },
    )
    await ensureMembership(
      connection,
      platformTenantId,
      platformAdminEmployeeId,
      platformDepartmentId,
    )
    await ensureEmployeeRole(
      connection,
      platformTenantId,
      platformAdminEmployeeId,
      superAdminRoleId,
    )

    const attendanceDays = await ensureAttendance(
      connection,
      demoTenantId,
      adminEmployeeId,
      config.timezone,
    )

    await connection.commit()

    console.log(
      JSON.stringify({
        level: 'info',
        message: 'seed.completed',
        demoCompany: {
          code: companyCode,
          tenantId: demoTenantId,
          username: 'admin',
          roles: ['admin'],
          permissions: [EMPLOYEE_MANAGE_PERMISSION],
        },
        platformCompany: {
          code: PLATFORM_COMPANY_CODE,
          tenantId: platformTenantId,
          username: 'superadmin',
          roles: ['super_admin'],
          permissions: [SUPER_ADMIN_PERMISSION],
        },
        attendanceDays,
        timezone: config.timezone,
      }),
    )
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'seed.failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  process.exit(1)
})
