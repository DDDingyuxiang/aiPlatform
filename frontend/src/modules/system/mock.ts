/**
 * 员工管理 Mock（仅在 features.mockApi 开启时加载）。
 *
 * 与真实后端保持同样的权限语义：
 * - u-003 superadmin 属于虚拟平台公司，可看所有公司；
 * - u-001 admin 是演示公司管理员，只能看演示公司；
 * - 其余账号无员工管理权限，返回 40300。
 */
import {
  ANNOUNCEMENT_PUBLISH_PERMISSION,
  EMPLOYEE_MANAGE_PERMISSION,
  SUPER_ADMIN_PERMISSION,
} from '@aiplatform/contracts/permissions'
import { findMockUser } from '@/core/auth/mock'
import { defineMock, fail, isMockFailure, type MockFailure } from '@/core/http'
import type {
  AdminEmployee,
  AdminEmployeeCreate,
  AdminEmployeeOptions,
  AdminEmployeePage,
  AdminEmployeeUpdate,
  AdminRoleSummary,
  AdminRolesResult,
  CompanySummary,
} from './types'

interface MockActor {
  kind: 'platform' | 'company'
  companyId: string | null
  employeeId: string
}

const ACTORS: Record<string, MockActor> = {
  'u-001': { kind: 'company', companyId: 'co-demo', employeeId: 'emp-001' },
  'u-003': { kind: 'platform', companyId: null, employeeId: 'emp-100' },
}

const DEMO_COMPANY: CompanySummary = {
  id: 'co-demo',
  code: 'demo',
  name: '演示企业',
  status: 'active',
}

const PLATFORM_COMPANY: CompanySummary = {
  id: 'co-platform',
  code: 'platform',
  name: '平台管理',
  status: 'active',
}

const COMPANIES: CompanySummary[] = [DEMO_COMPANY, PLATFORM_COMPANY]

const DEPARTMENTS: Record<string, Array<{ id: string; name: string }>> = {
  'co-demo': [
    { id: 'dept-demo-admin', name: '综合管理部' },
    { id: 'dept-demo-market', name: '市场部' },
    { id: 'dept-demo-tech', name: '技术部' },
  ],
  'co-platform': [{ id: 'dept-platform', name: '平台管理部' }],
}

const ROLE_DEFS: Record<
  string,
  Array<{ code: string; name: string; description: string; permissions: string[] }>
> = {
  'co-demo': [
    {
      code: 'admin',
      name: '管理员',
      description: '企业内管理角色',
      permissions: [EMPLOYEE_MANAGE_PERMISSION, ANNOUNCEMENT_PUBLISH_PERMISSION],
    },
    { code: 'employee', name: '员工', description: '普通员工', permissions: [] },
  ],
  'co-platform': [
    {
      code: 'super_admin',
      name: '超级管理员',
      description: '拥有平台全部权限',
      permissions: [SUPER_ADMIN_PERMISSION],
    },
  ],
}

const PERMISSION_CATALOG = [
  { code: SUPER_ADMIN_PERMISSION, description: '超级管理员权限（拥有全部权限）' },
  { code: EMPLOYEE_MANAGE_PERMISSION, description: '本企业员工管理（不跨公司）' },
  { code: ANNOUNCEMENT_PUBLISH_PERMISSION, description: '本企业公告发布（不跨公司）' },
]

const INITIAL_EMPLOYEES: AdminEmployee[] = [
  {
    id: 'emp-001',
    company: DEMO_COMPANY,
    username: 'admin',
    employeeId: 'E1001',
    name: '王立',
    position: '数字化平台主管',
    phone: '13800001001',
    email: 'admin@example.com',
    departmentId: 'dept-demo-admin',
    department: '综合管理部',
    roles: [{ code: 'admin', name: '管理员' }],
    status: 'active',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'emp-002',
    company: DEMO_COMPANY,
    username: 'lisi',
    employeeId: 'E1024',
    name: '李思',
    position: '市场专员',
    phone: '13800001024',
    email: 'lisi@example.com',
    departmentId: 'dept-demo-market',
    department: '市场部',
    roles: [{ code: 'employee', name: '员工' }],
    status: 'active',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'emp-003',
    company: DEMO_COMPANY,
    username: 'zhaoqiang',
    employeeId: 'E1025',
    name: '赵强',
    position: '技术主管',
    phone: '13800001025',
    email: 'zhaoqiang@example.com',
    departmentId: 'dept-demo-tech',
    department: '技术部',
    roles: [{ code: 'employee', name: '员工' }],
    status: 'disabled',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'emp-100',
    company: PLATFORM_COMPANY,
    username: 'superadmin',
    employeeId: 'P0001',
    name: '平台管理员',
    position: '平台超级管理员',
    phone: '13800000000',
    email: 'superadmin@example.com',
    departmentId: 'dept-platform',
    department: '平台管理部',
    roles: [{ code: 'super_admin', name: '超级管理员' }],
    status: 'active',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

let employees = clone(INITIAL_EMPLOYEES)
let sequence = 200

/** 测试用：恢复 mock 初始数据，避免测试顺序相互影响 */
export function resetSystemMockState(): void {
  employees = clone(INITIAL_EMPLOYEES)
  sequence = 200
}

function authorize(token: string | null): MockActor | MockFailure {
  const user = findMockUser(token)
  if (!user) return fail(40100, '登录状态已失效', 401)

  const actor = ACTORS[user.id]
  if (!actor) return fail(40300, '无权访问该资源', 403)
  return actor
}

function companyById(companyId: string): CompanySummary | undefined {
  return COMPANIES.find((company) => company.id === companyId)
}

function visibleCompanies(actor: MockActor): CompanySummary[] {
  if (actor.kind === 'platform') return COMPANIES
  return COMPANIES.filter((company) => company.id === actor.companyId)
}

function resolveCompany(
  actor: MockActor,
  companyId?: string,
): CompanySummary | null | MockFailure {
  if (actor.kind === 'company') {
    const own = actor.companyId ? companyById(actor.companyId) : undefined
    if (!own) return fail(50000, '当前企业不存在', 500)
    if (companyId && companyId !== own.id) return fail(40300, '无权访问该资源', 403)
    return own
  }

  if (!companyId) return null
  return companyById(companyId) ?? fail(40400, '公司不存在', 404)
}

function validateDepartment(
  companyId: string,
  departmentId: string | null | undefined,
): { id: string; name: string } | null | MockFailure {
  if (departmentId === undefined || departmentId === null) return null

  const department = (DEPARTMENTS[companyId] ?? []).find((item) => item.id === departmentId)
  if (!department) return fail(40000, '部门不存在或不属于该公司', 400)
  return department
}

function validateRoles(
  actor: MockActor,
  companyId: string,
  roleCodes: string[] | undefined,
): Array<{ code: string; name: string }> | undefined | MockFailure {
  if (roleCodes === undefined) return undefined

  const defs = ROLE_DEFS[companyId] ?? []
  const roles: Array<{ code: string; name: string }> = []

  for (const code of new Set(roleCodes)) {
    const def = defs.find((item) => item.code === code)
    if (!def) return fail(40000, '角色不存在或不属于该公司', 400)
    if (actor.kind !== 'platform' && def.permissions.includes(SUPER_ADMIN_PERMISSION)) {
      return fail(40300, '不能授予超级管理员角色', 403)
    }
    roles.push({ code: def.code, name: def.name })
  }

  return roles
}

function isEmployeeInScope(actor: MockActor, employee: AdminEmployee): boolean {
  return actor.kind === 'platform' || employee.company.id === actor.companyId
}

defineMock('GET', '/admin/employee-options', ({ token, query }) => {
  const actor = authorize(token)
  if (isMockFailure(actor)) return actor

  const companies = visibleCompanies(actor)
  const company = resolveCompany(actor, query.companyId)
  if (isMockFailure(company)) return company

  if (!company) {
    return {
      companies,
      departments: [],
      positions: [],
      roles: [],
    } satisfies AdminEmployeeOptions
  }

  const positions = [
    ...new Set(
      employees
        .filter((employee) => employee.company.id === company.id)
        .map((employee) => employee.position)
        .filter(Boolean),
    ),
  ].sort()

  return {
    companies,
    departments: DEPARTMENTS[company.id] ?? [],
    positions,
    roles: (ROLE_DEFS[company.id] ?? []).map((role) => ({
      code: role.code,
      name: role.name,
    })),
  } satisfies AdminEmployeeOptions
})

defineMock('GET', '/admin/users', ({ token, query }) => {
  const actor = authorize(token)
  if (isMockFailure(actor)) return actor

  const company = resolveCompany(actor, query.companyId)
  if (isMockFailure(company)) return company

  let list = employees.filter((employee) => isEmployeeInScope(actor, employee))
  if (company) list = list.filter((employee) => employee.company.id === company.id)

  if (query.departmentId) {
    list = list.filter((employee) => employee.departmentId === query.departmentId)
  }
  if (query.position) list = list.filter((employee) => employee.position === query.position)
  if (query.status) list = list.filter((employee) => employee.status === query.status)
  if (query.keyword) {
    const keyword = query.keyword.toLowerCase()
    list = list.filter((employee) =>
      [employee.name, employee.username, employee.employeeId, employee.email].some((value) =>
        value.toLowerCase().includes(keyword),
      ),
    )
  }

  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20) || 20))
  const total = list.length
  const items = list.slice((page - 1) * pageSize, page * pageSize)

  return {
    items: clone(items),
    total,
    page,
    pageSize,
  } satisfies AdminEmployeePage
})

defineMock('POST', '/admin/users', ({ token, body }) => {
  const actor = authorize(token)
  if (isMockFailure(actor)) return actor

  const payload = body as AdminEmployeeCreate | undefined
  if (!payload) return fail(40000, '请求参数不合法', 400)

  const company = resolveCompany(actor, payload.companyId)
  if (isMockFailure(company)) return company
  if (!company) return fail(40000, '请选择公司', 400)

  if (
    employees.some(
      (employee) =>
        employee.company.id === company.id && employee.username === payload.username,
    )
  ) {
    return fail(40902, '用户名已存在', 409)
  }
  const email = payload.email.toLowerCase()
  if (
    employees.some(
      (employee) => employee.company.id === company.id && employee.email === email,
    )
  ) {
    return fail(40901, '邮箱已被其他员工使用', 409)
  }
  if (
    employees.some(
      (employee) =>
        employee.company.id === company.id && employee.employeeId === payload.employeeNo,
    )
  ) {
    return fail(40903, '工号已存在', 409)
  }

  const department = validateDepartment(company.id, payload.departmentId)
  if (isMockFailure(department)) return department

  const roles = validateRoles(actor, company.id, payload.roleCodes ?? [])
  if (isMockFailure(roles)) return roles

  const now = new Date().toISOString()
  const employee: AdminEmployee = {
    id: `emp-${sequence++}`,
    company,
    username: payload.username,
    employeeId: payload.employeeNo,
    name: payload.name,
    position: payload.position ?? '',
    phone: payload.phone ?? '',
    email,
    departmentId: department?.id ?? null,
    department: department?.name ?? '',
    roles: roles ?? [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  employees.push(employee)
  return clone(employee)
})

defineMock('PATCH', '/admin/users/:id', ({ token, params, body }) => {
  const actor = authorize(token)
  if (isMockFailure(actor)) return actor

  const target = employees.find((employee) => employee.id === params.id)
  if (!target || !isEmployeeInScope(actor, target)) {
    return fail(40400, '员工不存在', 404)
  }

  const payload = body as AdminEmployeeUpdate | undefined
  if (!payload) return fail(40000, '请求参数不合法', 400)

  if (target.id === actor.employeeId && payload.status && payload.status !== 'active') {
    return fail(40300, '不能停用或锁定当前登录账号', 403)
  }

  if (payload.email) {
    const email = payload.email.toLowerCase()
    if (
      employees.some(
        (employee) =>
          employee.id !== target.id &&
          employee.company.id === target.company.id &&
          employee.email === email,
      )
    ) {
      return fail(40901, '邮箱已被其他员工使用', 409)
    }
  }

  const department =
    payload.departmentId === undefined
      ? undefined
      : validateDepartment(target.company.id, payload.departmentId)
  if (isMockFailure(department)) return department

  const roles = validateRoles(actor, target.company.id, payload.roleCodes)
  if (isMockFailure(roles)) return roles

  if (payload.name !== undefined) target.name = payload.name
  if (payload.email !== undefined) target.email = payload.email.toLowerCase()
  if (payload.position !== undefined) target.position = payload.position ?? ''
  if (payload.phone !== undefined) target.phone = payload.phone ?? ''
  if (payload.status !== undefined) target.status = payload.status

  if (department !== undefined) {
    target.departmentId = department?.id ?? null
    target.department = department?.name ?? ''
  }
  if (roles !== undefined) target.roles = roles

  target.updatedAt = new Date().toISOString()
  return clone(target)
})

defineMock('DELETE', '/admin/users/:id', ({ token, params }) => {
  const actor = authorize(token)
  if (isMockFailure(actor)) return actor

  const index = employees.findIndex((employee) => employee.id === params.id)
  if (index === -1 || !isEmployeeInScope(actor, employees[index]!)) {
    return fail(40400, '员工不存在', 404)
  }

  const target = employees[index]!
  if (target.id === actor.employeeId) {
    return fail(40300, '不能删除当前登录账号', 403)
  }

  if (
    target.company.id === PLATFORM_COMPANY.id &&
    target.roles.some((role) => role.code === 'super_admin')
  ) {
    const remaining = employees.filter(
      (employee) =>
        employee.id !== target.id &&
        employee.company.id === PLATFORM_COMPANY.id &&
        employee.status === 'active' &&
        employee.roles.some((role) => role.code === 'super_admin'),
    ).length
    if (remaining === 0) return fail(40300, '不能删除平台最后一个超级管理员', 403)
  }

  employees.splice(index, 1)
  return { ok: true }
})

defineMock('GET', '/admin/roles', ({ token, query }) => {
  const actor = authorize(token)
  if (isMockFailure(actor)) return actor

  let company: CompanySummary | null
  if (actor.kind === 'platform' && !query.companyId) {
    company = PLATFORM_COMPANY
  } else {
    const resolved = resolveCompany(actor, query.companyId)
    if (isMockFailure(resolved)) return resolved
    company = resolved
  }
  if (!company) return fail(40400, '公司不存在', 404)

  const roles: AdminRoleSummary[] = (ROLE_DEFS[company.id] ?? []).map((role) => ({
    code: role.code,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    memberCount: employees.filter(
      (employee) =>
        employee.company.id === company.id &&
        employee.roles.some((item) => item.code === role.code),
    ).length,
  }))

  return {
    roles,
    permissions: PERMISSION_CATALOG,
  } satisfies AdminRolesResult
})
