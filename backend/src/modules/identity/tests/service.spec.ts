import { describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '../../../http/errors.js'
import { createIdentityService } from '../service.js'
import {
  DuplicateEmailError,
  type AttendanceDayRecord,
  type DepartmentRecord,
  type IdentityRepository,
  type LoginCandidate,
  type MemberRecord,
  type PasswordVerifier,
  type ProfileRecord,
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
}

function setup(overrides: {
  candidates?: LoginCandidate[]
  profile?: ProfileRecord | null
  passwordValid?: boolean
  departments?: DepartmentRecord[]
  members?: MemberRecord[]
  attendance?: AttendanceDayRecord[]
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
  it('按角色代码选择系统角色，未命中 admin 时为 employee', async () => {
    const admin = setup({})
    await expect(
      admin.service.profile({ tenantId: '1', employeeId: '2', publicId: candidate.publicId }),
    ).resolves.toMatchObject({ role: 'admin' })

    const employee = setup({ profile: { ...profile, roleCodes: ['finance'] } })
    await expect(
      employee.service.profile({ tenantId: '1', employeeId: '2', publicId: candidate.publicId }),
    ).resolves.toMatchObject({ role: 'employee' })
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
