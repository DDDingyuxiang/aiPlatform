import { describe, expect, it, vi } from 'vitest'
import { createMemoryCacheStore } from '../../../infra/cache.js'
import { createCachedIdentityRepository } from '../cached-repository.js'
import type { IdentityRepository, ProfileRecord } from '../types.js'

const profile: ProfileRecord = {
  tenantId: '1',
  employeeId: '2',
  publicId: 'p-1',
  username: 'admin',
  name: '王立',
  employeeNo: 'E1001',
  position: null,
  email: 'admin@example.com',
  phone: null,
  status: 'active',
  department: null,
  roleCodes: ['admin'],
  permissionCodes: ['system.employee.manage'],
}

function setup() {
  const base: IdentityRepository = {
    findLoginCandidates: vi.fn(async () => []),
    findProfile: vi.fn(async () => profile),
    listDepartments: vi.fn(async () => []),
    listMembers: vi.fn(async () => []),
    listAttendance: vi.fn(async () => []),
    updateProfile: vi.fn(async () => {}),
    findCompanyIdByCode: vi.fn(async () => '100'),
    listCompanies: vi.fn(async () => []),
    listPositions: vi.fn(async () => []),
    findDepartmentInTenant: vi.fn(async () => true),
    findRolesByCodes: vi.fn(async () => []),
    listAdminEmployees: vi.fn(async () => ({ items: [], total: 0 })),
    findAdminEmployee: vi.fn(async () => null),
    createAdminEmployee: vi.fn(async () => {}),
    updateAdminEmployee: vi.fn(async () => {}),
    softDeleteAdminEmployee: vi.fn(async () => {}),
    listAdminRoles: vi.fn(async () => []),
    listPermissions: vi.fn(async () => []),
    updateAdminRolePermissions: vi.fn(async () => true),
  }
  const cache = createMemoryCacheStore()
  const repository = createCachedIdentityRepository(base, cache, {
    ttlSeconds: 60,
  })
  return { base, cache, repository }
}

describe('cached identity repository', () => {
  it('员工资料与权限数据命中缓存，避免重复查询', async () => {
    const { base, repository } = setup()

    await repository.findProfile('1', '2')
    await repository.findProfile('1', '2')
    expect(base.findProfile).toHaveBeenCalledTimes(1)

    await repository.listPermissions()
    await repository.listPermissions()
    expect(base.listPermissions).toHaveBeenCalledTimes(1)
  })

  it('员工写操作递增租户版本，使资料与列表缓存失效', async () => {
    const { base, repository } = setup()

    await repository.findProfile('1', '2')
    await repository.listAdminEmployees('1', { page: 1, pageSize: 20 })

    await repository.updateAdminEmployee('1', '2', { name: '新名字' })

    await repository.findProfile('1', '2')
    await repository.listAdminEmployees('1', { page: 1, pageSize: 20 })
    expect(base.findProfile).toHaveBeenCalledTimes(2)
    expect(base.listAdminEmployees).toHaveBeenCalledTimes(2)
  })

  it('跨租户查询使用全局版本，任一租户写入后同样失效', async () => {
    const { base, repository } = setup()
    const query = { page: 1, pageSize: 20 }

    await repository.listAdminEmployees(null, query)
    await repository.listAdminEmployees(null, query)
    expect(base.listAdminEmployees).toHaveBeenCalledTimes(1)

    await repository.softDeleteAdminEmployee('1', '2')
    await repository.listAdminEmployees(null, query)
    expect(base.listAdminEmployees).toHaveBeenCalledTimes(2)
  })

  it('登录查询不缓存，避免账号状态变化后仍返回旧数据', async () => {
    const { base, repository } = setup()

    await repository.findLoginCandidates('admin')
    await repository.findLoginCandidates('admin')
    expect(base.findLoginCandidates).toHaveBeenCalledTimes(2)
  })

  it('缓存键与查询参数顺序无关', async () => {
    const { base, repository } = setup()

    await repository.listAdminEmployees('1', { page: 1, pageSize: 20, status: 'active' })
    await repository.listAdminEmployees('1', { status: 'active', pageSize: 20, page: 1 })
    expect(base.listAdminEmployees).toHaveBeenCalledTimes(1)
  })
})
