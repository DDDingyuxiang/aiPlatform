import type {
  AttendanceResult,
  DirectoryResult,
  LoginPayload,
  LoginResult,
  ProfileUpdate,
  UserProfile,
} from '@aiplatform/contracts'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { Logger } from '../../shared/logger.js'
import { resolveMonthRange } from '../../shared/month-range.js'
import {
  DuplicateEmailError,
  type AuthContext,
  type IdentityRepository,
  type IdentityService,
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
  logger?: Logger
  /** 业务时区，用于“本月考勤”等自然月边界 */
  timezone?: string
  /** 便于测试固定当前时间 */
  now?: () => Date
}

export function createIdentityService(options: IdentityServiceOptions): IdentityService {
  const { repository, passwords, tokens, logger } = options
  const timezone = options.timezone ?? 'Asia/Shanghai'
  const now = options.now ?? (() => new Date())

  function invalidCredentials(): AppError {
    return new AppError(ErrorCode.INVALID_CREDENTIALS, '用户名或密码错误', 401)
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
      return loadProfile(
        auth.tenantId,
        auth.employeeId,
        new AppError(ErrorCode.UNAUTHORIZED, '登录状态已失效', 401),
      )
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

      return loadProfile(
        auth.tenantId,
        auth.employeeId,
        new AppError(ErrorCode.UNAUTHORIZED, '登录状态已失效', 401),
      )
    },
  }
}

/** 契约要求首页展示字段的空值归一化为空字符串 */
function toUserProfile(record: ProfileRecord): UserProfile {
  return {
    id: record.publicId,
    username: record.username,
    name: record.name,
    role: record.roleCodes.includes('admin') ? 'admin' : 'employee',
    employeeId: record.employeeNo,
    position: record.position ?? '',
    department: record.department ?? '',
    email: record.email,
    phone: record.phone ?? '',
  }
}
