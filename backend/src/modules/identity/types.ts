import type {
  AttendanceResult,
  AttendanceStatus,
  DirectoryResult,
  LoginPayload,
  LoginResult,
  ProfileUpdate,
  UserProfile,
} from '@aiplatform/contracts'

/** 认证通过后的请求上下文（仅内部使用，不向前端暴露内部自增 ID） */
export interface AuthContext {
  tenantId: string
  employeeId: string
  /** 员工对外 public_id，写入 JWT 的 sub */
  publicId: string
}

/** 登录查询结果：同一用户名可能因多租户存在多条记录 */
export interface LoginCandidate {
  tenantId: string
  employeeId: string
  publicId: string
  username: string
  employeeStatus: string
  companyStatus: string
  passwordHash: string
}

/** 员工资料及其主部门、角色代码 */
export interface ProfileRecord {
  tenantId: string
  employeeId: string
  publicId: string
  username: string
  name: string
  employeeNo: string
  position: string | null
  email: string
  phone: string | null
  status: string
  department: string | null
  roleCodes: string[]
}

/** 通讯录部门 */
export interface DepartmentRecord {
  id: string
  name: string
}

/** 通讯录成员（仅包含已有主部门的在职员工） */
export interface MemberRecord {
  id: string
  name: string
  employeeId: string
  position: string | null
  departmentId: string
  department: string
  email: string
  phone: string | null
}

/** 单日考勤 */
export interface AttendanceDayRecord {
  date: string
  status: AttendanceStatus
}

/** 已归一化的个人资料修改字段（空字符串已转换为 null） */
export interface ProfileUpdateRecord {
  name?: string
  position?: string | null
  email?: string
  phone?: string | null
}

/** 邮箱与企业内其他员工冲突；由服务层转换为稳定错误码 */
export class DuplicateEmailError extends Error {
  constructor() {
    super('邮箱已被其他员工使用')
    this.name = 'DuplicateEmailError'
  }
}

/** identity 模块的数据访问接口（由 MySQL 实现，测试可替换） */
export interface IdentityRepository {
  findLoginCandidates(username: string): Promise<LoginCandidate[]>
  findProfile(tenantId: string, employeeId: string): Promise<ProfileRecord | null>
  listDepartments(tenantId: string): Promise<DepartmentRecord[]>
  listMembers(tenantId: string): Promise<MemberRecord[]>
  listAttendance(
    tenantId: string,
    employeeId: string,
    startDate: string,
    nextMonthStartDate: string,
  ): Promise<AttendanceDayRecord[]>
  updateProfile(
    tenantId: string,
    employeeId: string,
    changes: ProfileUpdateRecord,
  ): Promise<void>
}

export interface PasswordVerifier {
  verify(plain: string, passwordHash: string): Promise<boolean>
}

export interface TokenIssuer {
  issue(auth: AuthContext): Promise<string>
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthContext>
}

/** identity 模块对外公开的应用服务 */
export interface IdentityService {
  login(payload: LoginPayload): Promise<LoginResult>
  profile(auth: AuthContext): Promise<UserProfile>
  logout(): Promise<{ ok: boolean }>
  directory(auth: AuthContext): Promise<DirectoryResult>
  /** 当前用户在当前业务时区的当月考勤 */
  attendance(auth: AuthContext): Promise<AttendanceResult>
  /** 修改当前用户可自助编辑的资料，返回更新后的完整资料 */
  updateProfile(auth: AuthContext, payload: ProfileUpdate): Promise<UserProfile>
}
