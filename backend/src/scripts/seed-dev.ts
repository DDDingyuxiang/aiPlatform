/**
 * 本地开发种子数据（仅用于开发/测试，不参与生产部署）。
 *
 * 前置条件：已执行 scripts/database/mysql 下的初始化脚本。
 * 密码来自 SEED_ADMIN_PASSWORD，不写入代码与版本库。
 */
import { ulid } from 'ulid'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { loadEnvFile } from '../config/env.js'
import { loadAppConfig } from '../config/index.js'
import { createDatabasePool } from '../infra/db.js'
import { hashPassword } from '../modules/identity/password.js'
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

async function ensureEmployee(
  connection: PoolConnection,
  tenantId: string,
  passwordHash: string,
): Promise<string> {
  let employeeId = await findId(
    connection,
    'SELECT id FROM employees WHERE tenant_id = ? AND username = ? AND deleted_at IS NULL LIMIT 1',
    [tenantId, 'admin'],
  )

  if (!employeeId) {
    await connection.execute(
      `INSERT INTO employees
         (tenant_id, public_id, employee_no, username, email, display_name, position, phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        tenantId,
        ulid(),
        'E1001',
        'admin',
        'admin@example.com',
        '王立',
        '数字化平台主管',
        '13800001001',
      ],
    )
    employeeId = await findId(
      connection,
      'SELECT id FROM employees WHERE tenant_id = ? AND username = ? LIMIT 1',
      [tenantId, 'admin'],
    )
    if (!employeeId) throw new Error('创建演示员工失败')
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

    const tenantId = await ensureCompany(connection, companyCode, companyName)
    const departmentId = await ensureDepartment(connection, tenantId, '综合管理部')
    const adminRoleId = await ensureRole(connection, tenantId, 'admin', '管理员')
    await ensureRole(connection, tenantId, 'employee', '员工')
    const employeeId = await ensureEmployee(connection, tenantId, passwordHash)
    await ensureMembership(connection, tenantId, employeeId, departmentId)
    await ensureEmployeeRole(connection, tenantId, employeeId, adminRoleId)
    const attendanceDays = await ensureAttendance(
      connection,
      tenantId,
      employeeId,
      config.timezone,
    )

    await connection.commit()

    console.log(
      JSON.stringify({
        level: 'info',
        message: 'seed.completed',
        companyCode,
        tenantId,
        employeeId,
        username: 'admin',
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
