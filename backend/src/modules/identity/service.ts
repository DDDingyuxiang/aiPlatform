import { ulid } from 'ulid'
import { EMPLOYEE_MANAGE_PERMISSION } from '@aiplatform/contracts'
import type {
  AdminEmployee,
  AdminEmployeeCreate,
  AdminEmployeeDeleteResult,
  AdminEmployeeOptions,
  AdminEmployeePage,
  AdminEmployeeQuery,
  AdminEmployeeUpdate,
  AdminRolesResult,
  AttendanceResult,
  CompanyStatus,
  DirectoryResult,
  EmployeeStatus,
  LoginPayload,
  LoginResult,
  ProfileUpdate,
  UserProfile,
} from '@aiplatform/contracts'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { Logger } from '../../shared/logger.js'
import { resolveMonthRange } from '../../shared/month-range.js'
import { PLATFORM_COMPANY_CODE } from './constants.js'
import { hashPassword } from './password.js'
import { hasCrossTenantAccess, hasPermission } from './policies.js'
import {
  DuplicateEmailError,
  DuplicateEmployeeFieldError,
  LastActiveSuperAdminError,
  type AdminEmployeeRecord,
  type AuthContext,
  type Authorization,
  type CompanyRecord,
  type IdentityRepository,
  type IdentityService,
  type PasswordHasher,
  type PasswordVerifier,
  type ProfileRecord,
  type ProfileUpdateRecord,
  type TokenIssuer,
} from './types.js'

/**
 * 用户不存在时也执行一次 bcrypt 比较，避免通过响应时间枚举账号。
 * 该哈希对应的明文不会被使用。
 */
const DUMMY_PASSWORD_HASH =
  '$2b$12$cxiIzLcNXA/pKDNCwBl7weX3DLaFCkouqg8MwkjQO10iEYUZoG8Vq'

export interface IdentityServiceOptions {
  repository: IdentityRepository
  passwords: PasswordVerifier
  tokens: TokenIssuer
  /** 新建员工的密码哈希能力；测试可注入低成本替身 */
  passwordHasher?: PasswordHasher
  logger?: Logger
  /** 业务时区，用于“本月考勤”等自然月边界 */
  timezone?: string
  /** 便于测试固定当前时间 */
  now?: () => Date
}

interface EmployeeScope {
  kind: 'platform' | 'company'
  /** platform 为 null（可跨公司）；company 固定为当前租户 */
  tenantId: string | null
  platformTenantId: string
}

export function createIdentityService(options: IdentityServiceOptions): IdentityService {
  const { repository, passwords, tokens, logger } = options
  const passwordHasher = options.passwordHasher ?? { hash: hashPassword }
  const timezone = options.timezone ?? 'Asia/Shanghai'
  const now = options.now ?? (() => new Date())

  function invalidCredentials(): AppError {
    return new AppError(ErrorCode.INVALID_CREDENTIALS, '用户名或密码错误', 401)
  }

  function unauthorized(): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, '登录状态已失效', 401)
  }

  function forbidden(message = '无权访问该资源'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, 403)
  }

  function notFound(message = '员工不存在'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, 404)
  }

  function invalid(message: string): AppError {
    return new AppError(ErrorCode.INVALID_PAYLOAD, message, 400)
  }

  async function verifyDummy(password: string): Promise<void> {
    await passwords.verify(password, DUMMY_PASSWORD_HASH)
  }

  async function loadProfile(
    tenantId: string,
    employeeId: string,
    error: AppError,
  ): Promise<UserProfile> {
    const record = await repository.findProfile(tenantId, employeeId)
    if (!record || record.status !== 'active') throw error
    return toUserProfile(record)
  }

  /**
   * 从可信登录上下文与数据库记录解析授权快照。
   *
   * 功能权限与跨租户资格分开计算：前者来自角色的权限码，后者还要求
   * 登录身份属于平台公司。任何前端传入的租户/权限信息都不参与判定。
   */
  async function resolveAuthorization(
    auth: AuthContext,
  ): Promise<Authorization & { platformTenantId: string }> {
    const record = await repository.findProfile(auth.tenantId, auth.employeeId)
    if (!record || record.status !== 'active') throw unauthorized()

    const platformTenantId = await repository.findCompanyIdByCode(PLATFORM_COMPANY_CODE)
    if (!platformTenantId) {
      throw new AppError(ErrorCode.INTERNAL, '平台公司尚未初始化，请先执行种子脚本', 500)
    }

    return {
      permissions: record.permissionCodes,
      canManageAcrossTenants: hasCrossTenantAccess(
        record.permissionCodes,
        auth.tenantId,
        platformTenantId,
      ),
      platformTenantId,
    }
  }

  /**
   * 判定管理端员工操作范围：平台超管跨公司，其余只能操作本企业。
   *
   * 所有管理端服务方法都必须以本函数作为第一步，禁止直接根据通配权限
   * 推断跨租户能力；新增接口同样必须经过这里或显式的跨租户中间件。
   */
  async function resolveEmployeeScope(auth: AuthContext): Promise<EmployeeScope> {
    const authorization = await resolveAuthorization(auth)

    const hasFunctionalAccess = hasPermission(
      authorization.permissions,
      EMPLOYEE_MANAGE_PERMISSION,
    )
    if (!hasFunctionalAccess) throw forbidden()

    const isPlatform = authorization.canManageAcrossTenants
    return {
      kind: isPlatform ? 'platform' : 'company',
      tenantId: isPlatform ? null : auth.tenantId,
      platformTenantId: authorization.platformTenantId,
    }
  }

  /**
   * 解析公司筛选/表单中的公司。
   * - 公司管理员：忽略未传值，传其他公司直接 403；
   * - 平台超管：未传返回 null（全部公司），传值必须是有效公司。
   */
  async function resolveSelectedCompany(
    scope: EmployeeScope,
    companyPublicId?: string,
  ): Promise<CompanyRecord | null> {
    const companies = await repository.listCompanies(
      scope.kind === 'platform' ? null : scope.tenantId,
    )

    if (scope.kind === 'company') {
      const company = companies.at(0)
      if (!company) throw new AppError(ErrorCode.INTERNAL, '当前企业不存在', 500)
      if (companyPublicId && companyPublicId !== company.publicId) throw forbidden()
      return company
    }

    if (!companyPublicId) return null
    const company = companies.find((item) => item.publicId === companyPublicId)
    if (!company) throw notFound('公司不存在')
    return company
  }

  /** 新建员工时必须落到一个明确公司 */
  async function resolveTargetCompany(
    scope: EmployeeScope,
    companyPublicId?: string,
  ): Promise<CompanyRecord> {
    const company = await resolveSelectedCompany(scope, companyPublicId)
    if (!company) throw invalid('请选择公司')
    return company
  }

  async function validateDepartment(
    tenantId: string,
    departmentId: string | null | undefined,
  ): Promise<void> {
    if (departmentId === undefined || departmentId === null) return
    const exists = await repository.findDepartmentInTenant(tenantId, departmentId)
    if (!exists) throw invalid('部门不存在或不属于该公司')
  }

  /** 校验角色归属；公司管理员不能授予带超管权限的角色 */
  async function resolveRoles(
    tenantId: string,
    roleCodes: string[] | undefined,
    scope: EmployeeScope,
  ): Promise<string[] | undefined> {
    if (roleCodes === undefined) return undefined

    const uniqueCodes = [...new Set(roleCodes)]
    const roles = await repository.findRolesByCodes(tenantId, uniqueCodes)
    if (roles.length !== uniqueCodes.length) {
      throw invalid('角色不存在或不属于该公司')
    }
    if (scope.kind !== 'platform' && roles.some((role) => role.hasSuperAdmin)) {
      throw forbidden('不能授予超级管理员角色')
    }
    return roles.map((role) => role.id)
  }

  async function loadAdminEmployee(
    scope: EmployeeScope,
    publicId: string,
  ): Promise<AdminEmployeeRecord> {
    const record = await repository.findAdminEmployee(scope.tenantId, publicId)
    if (!record) throw notFound()
    return record
  }

  function translateEmployeeError(error: unknown): never {
    if (error instanceof DuplicateEmployeeFieldError) {
      if (error.field === 'username') {
        throw new AppError(ErrorCode.USERNAME_CONFLICT, '用户名已存在', 409)
      }
      if (error.field === 'employeeNo') {
        throw new AppError(ErrorCode.EMPLOYEE_NO_CONFLICT, '工号已存在', 409)
      }
      throw new AppError(ErrorCode.EMAIL_CONFLICT, '邮箱已被其他员工使用', 409)
    }
    throw error
  }

  return {
    async login(payload: LoginPayload): Promise<LoginResult> {
      const candidates = await repository.findLoginCandidates(payload.username)
      const candidate = candidates.at(0)

      // 多租户下用户名可能重复：在租户选择能力就绪前拒绝，避免跨租户误登录
      if (candidates.length !== 1 || !candidate) {
        if (candidates.length > 1) {
          logger?.warn('identity.login_ambiguous', { candidateCount: candidates.length })
        }
        await verifyDummy(payload.password)
        throw invalidCredentials()
      }

      if (candidate.employeeStatus !== 'active' || candidate.companyStatus !== 'active') {
        await passwords.verify(payload.password, candidate.passwordHash)
        throw invalidCredentials()
      }

      const passwordValid = await passwords.verify(payload.password, candidate.passwordHash)
      if (!passwordValid) throw invalidCredentials()

      const user = await loadProfile(candidate.tenantId, candidate.employeeId, invalidCredentials())
      const token = await tokens.issue({
        tenantId: candidate.tenantId,
        employeeId: candidate.employeeId,
        publicId: candidate.publicId,
      })

      return { token, user }
    },

    async profile(auth: AuthContext): Promise<UserProfile> {
      return loadProfile(auth.tenantId, auth.employeeId, unauthorized())
    },

    async logout(): Promise<{ ok: boolean }> {
      // JWT 无状态：客户端清除令牌即可；服务端吊销能力在引入 Redis 后补充
      return { ok: true }
    },

    async directory(auth: AuthContext): Promise<DirectoryResult> {
      const [departments, members] = await Promise.all([
        repository.listDepartments(auth.tenantId),
        repository.listMembers(auth.tenantId),
      ])

      return {
        departments: departments.map((department) => ({
          id: department.id,
          name: department.name,
        })),
        members: members.map((member) => ({
          id: member.id,
          name: member.name,
          employeeId: member.employeeId,
          position: member.position ?? '',
          departmentId: member.departmentId,
          department: member.department,
          email: member.email,
          phone: member.phone ?? '',
        })),
      }
    },

    async attendance(auth: AuthContext): Promise<AttendanceResult> {
      const range = resolveMonthRange(timezone, now())
      const days = await repository.listAttendance(
        auth.tenantId,
        auth.employeeId,
        range.startDate,
        range.nextMonthStartDate,
      )

      return { month: range.month, days }
    },

    async updateProfile(auth: AuthContext, payload: ProfileUpdate): Promise<UserProfile> {
      const changes: ProfileUpdateRecord = {}

      if (payload.name !== undefined) changes.name = payload.name.trim()
      if (payload.position !== undefined) changes.position = payload.position?.trim() || null
      if (payload.email !== undefined) changes.email = payload.email.trim().toLowerCase()
      if (payload.phone !== undefined) changes.phone = payload.phone?.trim() || null

      try {
        await repository.updateProfile(auth.tenantId, auth.employeeId, changes)
      } catch (error) {
        if (error instanceof DuplicateEmailError) {
          throw new AppError(ErrorCode.EMAIL_CONFLICT, '邮箱已被其他员工使用', 409)
        }
        throw error
      }

      return loadProfile(auth.tenantId, auth.employeeId, unauthorized())
    },

    async permissions(auth: AuthContext): Promise<string[]> {
      const record = await repository.findProfile(auth.tenantId, auth.employeeId)
      if (!record || record.status !== 'active') throw unauthorized()
      return record.permissionCodes
    },

    async authorization(auth: AuthContext): Promise<Authorization> {
      const authorization = await resolveAuthorization(auth)
      return {
        permissions: authorization.permissions,
        canManageAcrossTenants: authorization.canManageAcrossTenants,
      }
    },

    async employeeOptions(
      auth: AuthContext,
      companyPublicId?: string,
    ): Promise<AdminEmployeeOptions> {
      const scope = await resolveEmployeeScope(auth)
      const companies = await repository.listCompanies(
        scope.kind === 'platform' ? null : scope.tenantId,
      )
      const selected = await resolveSelectedCompany(scope, companyPublicId)

      if (!selected) {
        return {
          companies: companies.map(toCompanySummary),
          departments: [],
          positions: [],
          roles: [],
        }
      }

      const [departments, positions, roles] = await Promise.all([
        repository.listDepartments(selected.tenantId),
        repository.listPositions(selected.tenantId),
        repository.listAdminRoles(selected.tenantId),
      ])

      return {
        companies: companies.map(toCompanySummary),
        departments: departments.map((department) => ({
          id: department.id,
          name: department.name,
        })),
        positions,
        roles: roles.map((role) => ({ code: role.code, name: role.name })),
      }
    },

    async adminUsers(auth: AuthContext, query: AdminEmployeeQuery): Promise<AdminEmployeePage> {
      const scope = await resolveEmployeeScope(auth)
      const company = await resolveSelectedCompany(scope, query.companyId)

      const { items, total } = await repository.listAdminEmployees(company?.tenantId ?? null, {
        page: query.page,
        pageSize: query.pageSize,
        departmentId: query.departmentId,
        position: query.position,
        status: query.status,
        keyword: query.keyword,
      })

      return {
        items: items.map(toAdminEmployee),
        total,
        page: query.page,
        pageSize: query.pageSize,
      }
    },

    async createEmployee(
      auth: AuthContext,
      payload: AdminEmployeeCreate,
    ): Promise<AdminEmployee> {
      const scope = await resolveEmployeeScope(auth)
      const company = await resolveTargetCompany(scope, payload.companyId)

      await validateDepartment(company.tenantId, payload.departmentId)
      const roles = await resolveRoles(company.tenantId, payload.roleCodes ?? [], scope)

      const publicId = ulid()
      const passwordHash = await passwordHasher.hash(payload.initialPassword)

      try {
        await repository.createAdminEmployee(company.tenantId, {
          publicId,
          username: payload.username,
          employeeNo: payload.employeeNo,
          email: payload.email.toLowerCase(),
          name: payload.name,
          position: payload.position ?? null,
          phone: payload.phone ?? null,
          departmentId: payload.departmentId ?? null,
          roleIds: roles ?? [],
          passwordHash,
        })
      } catch (error) {
        translateEmployeeError(error)
      }

      const record = await repository.findAdminEmployee(company.tenantId, publicId)
      if (!record) throw new AppError(ErrorCode.INTERNAL, '创建员工后读取失败', 500)
      return toAdminEmployee(record)
    },

    async updateEmployee(
      auth: AuthContext,
      publicId: string,
      payload: AdminEmployeeUpdate,
    ): Promise<AdminEmployee> {
      const scope = await resolveEmployeeScope(auth)
      const target = await loadAdminEmployee(scope, publicId)

      if (
        target.publicId === auth.publicId &&
        payload.status !== undefined &&
        payload.status !== 'active'
      ) {
        throw forbidden('不能停用或锁定当前登录账号')
      }

      await validateDepartment(target.tenantId, payload.departmentId)
      const roleIds = await resolveRoles(target.tenantId, payload.roleCodes, scope)

      // 只有可能移除“在职超管”的修改才需要事务内保护；
      // 真正的剩余数量校验与写入由仓库层在同一事务、同一把行锁下完成。
      const protectLastActiveSuperAdmin =
        target.tenantId === scope.platformTenantId &&
        (roleIds !== undefined ||
          (payload.status !== undefined && payload.status !== 'active'))

      try {
        await repository.updateAdminEmployee(
          target.tenantId,
          target.employeeId,
          {
            name: payload.name,
            email: payload.email?.toLowerCase(),
            position: payload.position,
            phone: payload.phone,
            departmentId: payload.departmentId,
            roleIds,
            status: payload.status,
          },
          { protectLastActiveSuperAdmin },
        )
      } catch (error) {
        if (error instanceof LastActiveSuperAdminError) {
          throw forbidden('不能移除平台最后一个超级管理员')
        }
        translateEmployeeError(error)
      }

      const updated = await repository.findAdminEmployee(target.tenantId, publicId)
      if (!updated) throw notFound()
      return toAdminEmployee(updated)
    },

    async deleteEmployee(
      auth: AuthContext,
      publicId: string,
    ): Promise<AdminEmployeeDeleteResult> {
      const scope = await resolveEmployeeScope(auth)
      const target = await loadAdminEmployee(scope, publicId)

      if (target.publicId === auth.publicId) {
        throw forbidden('不能删除当前登录账号')
      }

      try {
        await repository.softDeleteAdminEmployee(target.tenantId, target.employeeId, {
          protectLastActiveSuperAdmin: target.tenantId === scope.platformTenantId,
        })
      } catch (error) {
        if (error instanceof LastActiveSuperAdminError) {
          throw forbidden('不能删除平台最后一个超级管理员')
        }
        throw error
      }
      return { ok: true }
    },

    async adminRoles(
      auth: AuthContext,
      companyPublicId?: string,
    ): Promise<AdminRolesResult> {
      const scope = await resolveEmployeeScope(auth)

      let tenantId: string
      if (scope.kind === 'platform' && !companyPublicId) {
        tenantId = scope.platformTenantId
      } else {
        const company = await resolveSelectedCompany(scope, companyPublicId)
        if (!company) throw notFound('公司不存在')
        tenantId = company.tenantId
      }

      const [roles, permissions] = await Promise.all([
        repository.listAdminRoles(tenantId),
        repository.listPermissions(),
      ])

      return {
        roles: roles.map((role) => ({
          code: role.code,
          name: role.name,
          description: role.description ?? '',
          memberCount: role.memberCount,
          permissions: role.permissions,
        })),
        permissions: permissions.map((permission) => ({
          code: permission.code,
          description: permission.description ?? '',
        })),
      }
    },
  }
}

function toCompanyStatus(value: string): CompanyStatus {
  return value === 'suspended' || value === 'disabled' ? value : 'active'
}

function toCompanySummary(company: CompanyRecord) {
  return {
    id: company.publicId,
    code: company.code,
    name: company.name,
    status: toCompanyStatus(company.status),
  }
}

function toAdminEmployee(record: AdminEmployeeRecord): AdminEmployee {
  return {
    id: record.publicId,
    company: toCompanySummary(record.company),
    username: record.username,
    employeeId: record.employeeNo,
    name: record.name,
    position: record.position ?? '',
    phone: record.phone ?? '',
    email: record.email,
    departmentId: record.departmentId,
    department: record.department ?? '',
    roles: record.roles,
    status: toEmployeeStatus(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/** 系统角色按优先级映射：超管 > 管理员 > 普通员工 */
function toSystemRole(roleCodes: string[]): UserProfile['role'] {
  if (roleCodes.includes('super_admin')) return 'super_admin'
  if (roleCodes.includes('admin')) return 'admin'
  return 'employee'
}

function toEmployeeStatus(status: string): EmployeeStatus {
  return status === 'disabled' || status === 'locked' ? status : 'active'
}

/** 契约要求首页展示字段的空值归一化为空字符串 */
function toUserProfile(record: ProfileRecord): UserProfile {
  return {
    id: record.publicId,
    username: record.username,
    name: record.name,
    role: toSystemRole(record.roleCodes),
    permissions: record.permissionCodes,
    employeeId: record.employeeNo,
    position: record.position ?? '',
    department: record.department ?? '',
    email: record.email,
    phone: record.phone ?? '',
  }
}
