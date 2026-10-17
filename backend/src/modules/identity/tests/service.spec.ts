import { describe, expect, it, vi } from 'vitest'
import {
  EMPLOYEE_MANAGE_PERMISSION,
  SUPER_ADMIN_PERMISSION,
} from '@aiplatform/contracts'
import { ErrorCode } from '../../../http/errors.js'
import { createIdentityService } from '../service.js'
import {
  DuplicateEmailError,
  DuplicateEmployeeFieldError,
  type AdminEmployeeRecord,
  type AdminRoleRecord,
  type AttendanceDayRecord,
  type CompanyRecord,
  type DepartmentRecord,
  type IdentityRepository,
  type LoginCandidate,
  type MemberRecord,
  type PasswordVerifier,
  type PermissionRecord,
  type ProfileRecord,
  type RoleRefRecord,
  type TokenIssuer,
} from '../types.js'

const candidate: LoginCandidate = {
  tenantId: '1',
  employeeId: '2',
  publicId: '01J00000000000000000000001',
  username: 'admin',
  employeeStatus: 'active',
  companyStatus: 'active',
  passwordHash: 'hashed',
}

const profile: ProfileRecord = {
  tenantId: '1',
  employeeId: '2',
  publicId: '01J00000000000000000000001',
  username: 'admin',
  name: '王立',
  employeeNo: 'E1001',
  position: '数字化平台主管',
  email: 'admin@example.com',
  phone: null,
  status: 'active',
  department: '综合管理部',
  roleCodes: ['admin'],
  permissionCodes: ['system.super_admin'],
}

const demoCompany: CompanyRecord = {
  tenantId: '1',
  publicId: '01J00000000000000000000009',
  code: 'demo',
  name: '演示企业',
  status: 'active',
}

const platformCompany: CompanyRecord = {
  tenantId: '100',
  publicId: '01J00000000000000000000100',
  code: 'platform',
  name: '平台管理',
  status: 'active',
}

const adminEmployee: AdminEmployeeRecord = {
  tenantId: '1',
  employeeId: '2',
  publicId: profile.publicId,
  company: demoCompany,
  username: 'admin',
  employeeNo: 'E1001',
  name: '王立',
  position: null,
  phone: null,
  email: 'admin@example.com',
  departmentId: null,
  department: null,
  status: 'active',
  roles: [{ code: 'admin', name: '管理员' }],
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt: '2026-10-17T00:00:00.000Z',
}

function setup(overrides: {
  candidates?: LoginCandidate[]
  profile?: ProfileRecord | null
  passwordValid?: boolean
  departments?: DepartmentRecord[]
  members?: MemberRecord[]
  attendance?: AttendanceDayRecord[]
  adminEmployees?: AdminEmployeeRecord[]
  adminEmployee?: AdminEmployeeRecord | null
  adminRoles?: AdminRoleRecord[]
  permissionCatalog?: PermissionRecord[]
  companies?: CompanyRecord[]
  platformTenantId?: string | null
  rolesByCodes?: RoleRefRecord[]
  positions?: string[]
  departmentExists?: boolean
  remainingSuperAdmins?: number
  createError?: Error
  now?: Date
  timezone?: string
  updateError?: Error
}) {
  const profileRecord = overrides.profile === undefined ? profile : overrides.profile
  const repository: IdentityRepository = {
    findLoginCandidates: vi.fn(async () => overrides.candidates ?? [candidate]),
    findProfile: vi.fn(async () => profileRecord),
    listDepartments: vi.fn(async () => overrides.departments ?? []),
    listMembers: vi.fn(async () => overrides.members ?? []),
    listAttendance: vi.fn(async () => overrides.attendance ?? []),
    updateProfile: vi.fn(async () => {
      if (overrides.updateError) throw overrides.updateError
    }),

    findCompanyIdByCode: vi.fn(async () =>
      overrides.platformTenantId === undefined ? '100' : overrides.platformTenantId,
    ),
    listCompanies: vi.fn(async () => overrides.companies ?? [demoCompany]),
    listPositions: vi.fn(async () => overrides.positions ?? []),
    findDepartmentInTenant: vi.fn(async () => overrides.departmentExists ?? true),
    findRolesByCodes: vi.fn(
      async (_tenantId, codes) =>
        overrides.rolesByCodes ??
        codes.map((code) => ({
          id: `role-${code}`,
          code,
          name: code,
          hasSuperAdmin: false,
        })),
    ),

    listAdminEmployees: vi.fn(async () => ({
      items: overrides.adminEmployees ?? [],
      total: overrides.adminEmployees?.length ?? 0,
    })),
    findAdminEmployee: vi.fn(async () =>
      overrides.adminEmployee === undefined ? null : overrides.adminEmployee,
    ),
    createAdminEmployee: vi.fn(async () => {
      if (overrides.createError) throw overrides.createError
    }),
    updateAdminEmployee: vi.fn(async () => {}),
    softDeleteAdminEmployee: vi.fn(async () => {}),
    countActiveSuperAdmins: vi.fn(async () => overrides.remainingSuperAdmins ?? 1),

    listAdminRoles: vi.fn(async () => overrides.adminRoles ?? []),
    listPermissions: vi.fn(async () => overrides.permissionCatalog ?? []),
  }
  const passwords: PasswordVerifier = {
    verify: vi.fn(
      async (plain: string, hash: string) =>
        overrides.passwordValid !== false && plain === '123456' && hash === 'hashed',
    ),
  }
  const tokens: TokenIssuer = {
    issue: vi.fn(async () => 'signed-token'),
  }
  const service = createIdentityService({
    repository,
    passwords,
    tokens,
    passwordHasher: { hash: async () => 'hashed-password' },
    timezone: overrides.timezone ?? 'Asia/Shanghai',
    now: () => overrides.now ?? new Date('2026-10-17T00:00:00Z'),
  })

  return { service, repository, passwords, tokens }
}

describe('identity service login', () => {
  it('凭证正确时返回令牌与首页用户资料', async () => {
    const { service, tokens } = setup({})

    const result = await service.login({
      username: 'admin',
      password: '123456',
      remember: false,
    })

    expect(result.token).toBe('signed-token')
    expect(result.user).toMatchObject({
      id: candidate.publicId,
      username: 'admin',
      name: '王立',
      role: 'admin',
      permissions: ['system.super_admin'],
      department: '综合管理部',
      phone: '',
    })
    expect(tokens.issue).toHaveBeenCalledWith({
      tenantId: '1',
      employeeId: '2',
      publicId: candidate.publicId,
    })
  })

  it('未知用户与多租户重名用户均返回统一错误，并执行占位比较', async () => {
    for (const candidates of [[], [candidate, { ...candidate, tenantId: '9' }]]) {
      const { service, passwords } = setup({ candidates })

      await expect(
        service.login({ username: 'admin', password: '123456', remember: false }),
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS, status: 401 })
      expect(passwords.verify).toHaveBeenCalledTimes(1)
    }
  })

  it('密码错误与停用账号均被拒绝', async () => {
    const wrongPassword = setup({ passwordValid: false })
    await expect(
      wrongPassword.service.login({
        username: 'admin',
        password: 'wrong',
        remember: false,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS })

    const disabled = setup({
      candidates: [{ ...candidate, employeeStatus: 'disabled' }],
    })
    await expect(
      disabled.service.login({
        username: 'admin',
        password: '123456',
        remember: false,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS })
  })

  it('已认证但资料不存在时返回登录失效', async () => {
    const { service } = setup({ profile: null })

    await expect(
      service.login({ username: 'admin', password: '123456', remember: false }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS })
  })
})

describe('identity service profile', () => {
  it('按角色代码优先级选择系统角色：super_admin > admin > employee', async () => {
    const superAdmin = setup({ profile: { ...profile, roleCodes: ['admin', 'super_admin'] } })
    await expect(
      superAdmin.service.profile({ tenantId: '1', employeeId: '2', publicId: candidate.publicId }),
    ).resolves.toMatchObject({ role: 'super_admin' })

    const admin = setup({})
    await expect(
      admin.service.profile({ tenantId: '1', employeeId: '2', publicId: candidate.publicId }),
    ).resolves.toMatchObject({ role: 'admin' })

    const employee = setup({ profile: { ...profile, roleCodes: ['finance'] } })
    await expect(
      employee.service.profile({ tenantId: '1', employeeId: '2', publicId: candidate.publicId }),
    ).resolves.toMatchObject({ role: 'employee' })
  })

  it('权限读取返回角色授予的权限码，停用账号返回登录失效', async () => {
    const auth = { tenantId: '1', employeeId: '2', publicId: candidate.publicId }
    const allowed = setup({})
    await expect(allowed.service.permissions(auth)).resolves.toEqual(['system.super_admin'])

    const disabled = setup({ profile: { ...profile, status: 'disabled' } })
    await expect(disabled.service.permissions(auth)).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
      status: 401,
    })
  })

  it('资料缺失或账号停用时返回登录失效', async () => {
    for (const record of [null, { ...profile, status: 'disabled' }]) {
      const { service } = setup({ profile: record })
      await expect(
        service.profile({ tenantId: '1', employeeId: '2', publicId: candidate.publicId }),
      ).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED, status: 401 })
    }
  })

  it('登出为幂等成功', async () => {
    const { service } = setup({})
    await expect(service.logout()).resolves.toEqual({ ok: true })
  })
})

describe('identity service employee scope and admin overview', () => {
  const auth = { tenantId: '1', employeeId: '2', publicId: candidate.publicId }
  const platformAuth = {
    tenantId: '100',
    employeeId: '200',
    publicId: '01J00000000000000000000200',
  }
  const companyAdminProfile: ProfileRecord = {
    ...profile,
    roleCodes: ['admin'],
    permissionCodes: [EMPLOYEE_MANAGE_PERMISSION],
  }
  const platformProfile: ProfileRecord = {
    ...profile,
    tenantId: '100',
    employeeId: '200',
    publicId: platformAuth.publicId,
    roleCodes: ['super_admin'],
    permissionCodes: [SUPER_ADMIN_PERMISSION],
  }

  it('公司管理员只按当前租户查询，并归一化可空展示字段', async () => {
    const { service, repository } = setup({
      profile: companyAdminProfile,
      companies: [demoCompany],
      adminEmployees: [adminEmployee],
    })

    const result = await service.adminUsers(auth, { page: 1, pageSize: 20 })

    expect(result).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
      items: [
        {
          id: candidate.publicId,
          company: { code: 'demo' },
          employeeId: 'E1001',
          position: '',
          phone: '',
          department: '',
        },
      ],
    })
    expect(repository.listAdminEmployees).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ page: 1, pageSize: 20 }),
    )
  })

  it('公司管理员传其他公司 ID 返回 403', async () => {
    const { service } = setup({ profile: companyAdminProfile, companies: [demoCompany] })

    await expect(
      service.adminUsers(auth, {
        page: 1,
        pageSize: 20,
        companyId: platformCompany.publicId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN })
  })

  it('平台超管未选公司时跨公司查询，选中公司时按公司过滤', async () => {
    const { service, repository } = setup({
      profile: platformProfile,
      platformTenantId: '100',
      companies: [platformCompany, demoCompany],
      adminEmployees: [adminEmployee],
    })

    await service.adminUsers(platformAuth, { page: 1, pageSize: 20 })
    expect(repository.listAdminEmployees).toHaveBeenCalledWith(null, expect.anything())

    await service.adminUsers(platformAuth, {
      page: 1,
      pageSize: 20,
      companyId: demoCompany.publicId,
    })
    expect(repository.listAdminEmployees).toHaveBeenLastCalledWith('1', expect.anything())
  })

  it('员工选项未选公司时只返回公司列表', async () => {
    const { service } = setup({
      profile: platformProfile,
      platformTenantId: '100',
      companies: [platformCompany, demoCompany],
    })

    const options = await service.employeeOptions(platformAuth)

    expect(options.companies.map((company) => company.code)).toEqual(['platform', 'demo'])
    expect(options.departments).toEqual([])
    expect(options.positions).toEqual([])
    expect(options.roles).toEqual([])
  })

  it('创建员工：公司管理员强制本企业并哈希初始密码', async () => {
    const { service, repository } = setup({
      profile: companyAdminProfile,
      companies: [demoCompany],
      adminEmployee,
    })

    const result = await service.createEmployee(auth, {
      username: 'zhangsan',
      employeeNo: 'E2001',
      email: 'ZHANGSAN@EXAMPLE.COM',
      name: '张三',
      departmentId: null,
      roleCodes: ['employee'],
      initialPassword: '12345678',
    })

    expect(repository.createAdminEmployee).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        username: 'zhangsan',
        email: 'zhangsan@example.com',
        passwordHash: 'hashed-password',
        roleIds: ['role-employee'],
      }),
    )
    expect(result.id).toBe(adminEmployee.publicId)
  })

  it('重复用户名映射 40902；公司管理员不能授予超管角色', async () => {
    const duplicate = setup({
      profile: companyAdminProfile,
      companies: [demoCompany],
      createError: new DuplicateEmployeeFieldError('username'),
    })
    await expect(
      duplicate.service.createEmployee(auth, {
        username: 'zhangsan',
        employeeNo: 'E2001',
        email: 'zhangsan@example.com',
        name: '张三',
        initialPassword: '12345678',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.USERNAME_CONFLICT, status: 409 })

    const escalate = setup({
      profile: companyAdminProfile,
      companies: [demoCompany],
      rolesByCodes: [
        { id: 'role-super', code: 'super_admin', name: '超级管理员', hasSuperAdmin: true },
      ],
    })
    await expect(
      escalate.service.createEmployee(auth, {
        username: 'zhangsan',
        employeeNo: 'E2001',
        email: 'zhangsan@example.com',
        name: '张三',
        roleCodes: ['super_admin'],
        initialPassword: '12345678',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN })
  })

  it('不能删除自己；不能删除平台最后一个超管', async () => {
    const self = setup({
      profile: companyAdminProfile,
      companies: [demoCompany],
      adminEmployee: { ...adminEmployee, publicId: auth.publicId },
    })
    await expect(self.service.deleteEmployee(auth, auth.publicId)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    })

    const lastSuperAdmin = setup({
      profile: platformProfile,
      platformTenantId: '100',
      companies: [platformCompany],
      adminEmployee: {
        ...adminEmployee,
        tenantId: '100',
        employeeId: '201',
        publicId: '01J00000000000000000000201',
        company: platformCompany,
        roles: [{ code: 'super_admin', name: '超级管理员' }],
      },
      remainingSuperAdmins: 0,
    })
    await expect(
      lastSuperAdmin.service.deleteEmployee(platformAuth, '01J00000000000000000000201'),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN })
  })

  it('角色总览按公司返回成员数、权限码与权限目录', async () => {
    const { service } = setup({
      profile: companyAdminProfile,
      companies: [demoCompany],
      adminRoles: [
        {
          code: 'admin',
          name: '管理员',
          description: null,
          memberCount: 1,
          permissions: [EMPLOYEE_MANAGE_PERMISSION],
        },
      ],
      permissionCatalog: [{ code: EMPLOYEE_MANAGE_PERMISSION, description: null }],
    })

    await expect(service.adminRoles(auth)).resolves.toEqual({
      roles: [
        {
          code: 'admin',
          name: '管理员',
          description: '',
          memberCount: 1,
          permissions: [EMPLOYEE_MANAGE_PERMISSION],
        },
      ],
      permissions: [{ code: EMPLOYEE_MANAGE_PERMISSION, description: '' }],
    })
  })
})

describe('identity service directory and attendance', () => {
  const auth = { tenantId: '1', employeeId: '2', publicId: candidate.publicId }

  it('通讯录按契约归一化空职位与空电话', async () => {
    const { service } = setup({
      departments: [{ id: '10', name: '综合管理部' }],
      members: [
        {
          id: candidate.publicId,
          name: '王立',
          employeeId: 'E1001',
          position: null,
          departmentId: '10',
          department: '综合管理部',
          email: 'admin@example.com',
          phone: null,
        },
      ],
    })

    await expect(service.directory(auth)).resolves.toEqual({
      departments: [{ id: '10', name: '综合管理部' }],
      members: [
        {
          id: candidate.publicId,
          name: '王立',
          employeeId: 'E1001',
          position: '',
          departmentId: '10',
          department: '综合管理部',
          email: 'admin@example.com',
          phone: '',
        },
      ],
    })
  })

  it('当月考勤按业务时区计算左闭右开区间', async () => {
    const { service, repository } = setup({
      attendance: [
        { date: '2026-10-01', status: 'normal' },
        { date: '2026-10-02', status: 'late' },
      ],
    })

    await expect(service.attendance(auth)).resolves.toEqual({
      month: '2026-10',
      days: [
        { date: '2026-10-01', status: 'normal' },
        { date: '2026-10-02', status: 'late' },
      ],
    })
    expect(repository.listAttendance).toHaveBeenCalledWith(
      '1',
      '2',
      '2026-10-01',
      '2026-11-01',
    )
  })

  it('跨月时按 Asia/Shanghai 归属月份', async () => {
    const { service, repository } = setup({
      now: new Date('2026-10-31T16:30:00Z'),
    })

    const result = await service.attendance(auth)
    expect(result.month).toBe('2026-11')
    expect(repository.listAttendance).toHaveBeenCalledWith(
      '1',
      '2',
      '2026-11-01',
      '2026-12-01',
    )
  })
})

describe('identity service profile update', () => {
  const auth = { tenantId: '1', employeeId: '2', publicId: candidate.publicId }

  it('归一化姓名、职位、邮箱与手机号后更新', async () => {
    const { service, repository } = setup({})

    await service.updateProfile(auth, {
      name: ' 李思 ',
      position: '   ',
      email: ' LISI@EXAMPLE.COM ',
      phone: ' 13800001024 ',
    })

    expect(repository.updateProfile).toHaveBeenCalledWith('1', '2', {
      name: '李思',
      position: null,
      email: 'lisi@example.com',
      phone: '13800001024',
    })
  })

  it('邮箱冲突转换为 40901', async () => {
    const { service } = setup({ updateError: new DuplicateEmailError() })

    await expect(
      service.updateProfile(auth, { email: 'taken@example.com' }),
    ).rejects.toMatchObject({ code: ErrorCode.EMAIL_CONFLICT, status: 409 })
  })

  it('更新后资料缺失时返回登录失效', async () => {
    const { service } = setup({ profile: null })

    await expect(service.updateProfile(auth, { name: '李思' })).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
      status: 401,
    })
  })
})
