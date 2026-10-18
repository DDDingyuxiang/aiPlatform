import type { Pool } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { createMySqlIdentityRepository } from '../repository.js'
import { LastActiveSuperAdminError } from '../types.js'

interface RecordedQuery {
  sql: string
  params?: unknown[]
}

/**
 * 构造只记录 SQL 的假连接，用于验证“检查 + 写入”发生在同一事务内，
 * 且串行化锁（SELECT ... FOR UPDATE）先于计数与写入执行。
 */
function createFakePool(remainingSuperAdmins: number) {
  const queries: RecordedQuery[] = []

  function respond(sql: string): unknown[] {
    if (sql.includes('FROM companies') && sql.includes('FOR UPDATE')) {
      return [{ id: '100' }]
    }
    if (sql.trimStart().startsWith('SELECT status')) {
      return [{ status: 'active' }]
    }
    if (sql.includes('FROM employee_roles er') && sql.includes('p.code = ?')) {
      return [{ 1: 1 }]
    }
    if (sql.includes('COUNT(DISTINCT e.id)')) {
      return [{ total: remainingSuperAdmins }]
    }
    return []
  }

  const connection = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(() => {}),
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      return [respond(sql), []]
    }),
  }

  const pool = {
    getConnection: vi.fn(async () => connection),
  } as unknown as Pool

  return { pool, connection, queries }
}

function findIndex(queries: RecordedQuery[], fragment: string): number {
  return queries.findIndex((query) => query.sql.includes(fragment))
}

describe('identity repository last super admin guard', () => {
  it('最后一个超管被停用：同一事务内先加锁校验，再回滚且不写入', async () => {
    const { pool, connection, queries } = createFakePool(0)
    const repository = createMySqlIdentityRepository(pool)

    await expect(
      repository.updateAdminEmployee(
        '100',
        '201',
        { status: 'disabled' },
        { protectLastActiveSuperAdmin: true },
      ),
    ).rejects.toBeInstanceOf(LastActiveSuperAdminError)

    const lockAt = findIndex(queries, 'FOR UPDATE')
    const countAt = findIndex(queries, 'COUNT(DISTINCT e.id)')
    const updateAt = findIndex(queries, 'UPDATE employees')

    expect(lockAt).toBe(0)
    expect(countAt).toBeGreaterThan(lockAt)
    expect(updateAt).toBe(-1)
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1)
    expect(connection.rollback).toHaveBeenCalledTimes(1)
    expect(connection.commit).not.toHaveBeenCalled()
  })

  it('仍有其他超管时才提交写入，且锁在同一事务内', async () => {
    const { pool, connection, queries } = createFakePool(1)
    const repository = createMySqlIdentityRepository(pool)

    await repository.updateAdminEmployee(
      '100',
      '201',
      { status: 'disabled' },
      { protectLastActiveSuperAdmin: true },
    )

    const lockAt = findIndex(queries, 'FOR UPDATE')
    const countAt = findIndex(queries, 'COUNT(DISTINCT e.id)')
    const updateAt = findIndex(queries, 'UPDATE employees')

    expect(lockAt).toBe(0)
    expect(countAt).toBeGreaterThan(lockAt)
    expect(updateAt).toBeGreaterThan(countAt)
    expect(connection.commit).toHaveBeenCalledTimes(1)
    expect(connection.rollback).not.toHaveBeenCalled()
  })

  it('删除最后一个超管同样在事务内被拦截', async () => {
    const { pool, connection, queries } = createFakePool(0)
    const repository = createMySqlIdentityRepository(pool)

    await expect(
      repository.softDeleteAdminEmployee('100', '201', {
        protectLastActiveSuperAdmin: true,
      }),
    ).rejects.toBeInstanceOf(LastActiveSuperAdminError)

    expect(findIndex(queries, 'FOR UPDATE')).toBe(0)
    expect(findIndex(queries, 'UPDATE employees')).toBe(-1)
    expect(connection.rollback).toHaveBeenCalledTimes(1)
    expect(connection.commit).not.toHaveBeenCalled()
  })

  it('未开启保护时不加租户锁，也不做额外计数', async () => {
    const { pool, queries } = createFakePool(0)
    const repository = createMySqlIdentityRepository(pool)

    await repository.softDeleteAdminEmployee('1', '2')

    expect(findIndex(queries, 'FOR UPDATE')).toBe(-1)
    expect(findIndex(queries, 'COUNT(DISTINCT e.id)')).toBe(-1)
    expect(findIndex(queries, 'UPDATE employees')).toBeGreaterThanOrEqual(0)
  })
})
