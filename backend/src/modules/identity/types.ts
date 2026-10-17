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
  /** 角色经 role_permissions 授予的权限码 */
  permissionCodes: string[]
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

/** 管理端员工唯一键冲突字段 */
export type DuplicateEmployeeField = 'username' | 'email' | 'employeeNo'

export class DuplicateEmployeeFieldError extends Error {
  readonly field: DuplicateEmployeeField

  constructor(field: DuplicateEmployeeField) {
    super(`员工唯一键冲突：${field}`)
    this.name = 'DuplicateEmployeeFieldError'
    this.field = field
  }
}

/** 公司（租户）记录；tenantId 为内部 ID，不向前端暴露 */
export interface CompanyRecord {
  tenantId: string
  publicId: string
  code: string
  name: string
  status: string
}

/** 管理端员工记录（含公司、主部门与角色） */
export interface AdminEmployeeRecord {
  tenantId: string
  employeeId: string
  publicId: string
  company: CompanyRecord
  username: string
  employeeNo: string
  name: string
  position: string | null
  phone: string | null
  email: string
  departmentId: string | null
  department: string | null
  status: string
  roles: Array<{ code: string; name: string }>
  createdAt: string
  updatedAt: string
}

/** 角色校验结果；hasSuperAdmin 用于阻止公司管理员授予超管权限 */
export interface RoleRefRecord {
  id: string
  code: string
  name: string
  hasSuperAdmin: boolean
}

/** 新建员工的持久化输入（密码已哈希，部门/角色已校验） */
export interface AdminEmployeeCreateRecord {
  publicId: string
  username: string
  employeeNo: string
  email: string
  name: string
  position: string | null
  phone: string | null
  departmentId: string | null
  roleIds: string[]
  passwordHash: string
}

/** 更新员工的持久化输入；roleIds/departmentId 为 undefined 表示不修改 */
export interface AdminEmployeeUpdateRecord {
  name?: string
  email?: string
  position?: string | null
  phone?: string | null
  departmentId?: string | null
  roleIds?: string[]
  status?: string
}

/** 管理端员工列表查询（租户范围由服务层单独传入） */
export interface AdminEmployeeListQuery {
  page: number
  pageSize: number
  departmentId?: string
  position?: string
  status?: string
  keyword?: string
}

/** 管理端角色、成员数与权限码 */
export interface AdminRoleRecord {
  code: string
  name: string
  description: string | null
  memberCount: number
  permissions: string[]
}

/** 权限目录项 */
export interface PermissionRecord {
  code: string
  description: string | null
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

  findCompanyIdByCode(code: string): Promise<string | null>
  listCompanies(tenantId: string | null): Promise<CompanyRecord[]>
  listPositions(tenantId: string): Promise<string[]>
  findDepartmentInTenant(tenantId: string, departmentId: string): Promise<boolean>
  findRolesByCodes(tenantId: string, codes: string[]): Promise<RoleRefRecord[]>

  listAdminEmployees(
    tenantId: string | null,
    query: AdminEmployeeListQuery,
  ): Promise<{ items: AdminEmployeeRecord[]; total: number }>
  findAdminEmployee(
    tenantId: string | null,
    publicId: string,
  ): Promise<AdminEmployeeRecord | null>
  createAdminEmployee(tenantId: string, record: AdminEmployeeCreateRecord): Promise<void>
  updateAdminEmployee(
    tenantId: string,
    employeeId: string,
    changes: AdminEmployeeUpdateRecord,
  ): Promise<void>
  softDeleteAdminEmployee(tenantId: string, employeeId: string): Promise<void>
  countActiveSuperAdmins(tenantId: string, excludeEmployeeId: string): Promise<number>

  listAdminRoles(tenantId: string): Promise<AdminRoleRecord[]>
  listPermissions(): Promise<PermissionRecord[]>
}

export interface PasswordVerifier {
  verify(plain: string, passwordHash: string): Promise<boolean>
}

/** 新建员工时的密码哈希能力（可注入测试替身，避免 bcrypt 成本） */
export interface PasswordHasher {
  hash(plain: string): Promise<string>
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
  /** 当前身份持有的权限码（供授权中间件使用） */
  permissions(auth: AuthContext): Promise<string[]>

  /** 管理端员工选项：公司 + 所选公司的部门/职位/角色 */
  employeeOptions(auth: AuthContext, companyPublicId?: string): Promise<AdminEmployeeOptions>
  /** 管理端员工分页列表 */
  adminUsers(auth: AuthContext, query: AdminEmployeeQuery): Promise<AdminEmployeePage>
  createEmployee(auth: AuthContext, payload: AdminEmployeeCreate): Promise<AdminEmployee>
  updateEmployee(
    auth: AuthContext,
    publicId: string,
    payload: AdminEmployeeUpdate,
  ): Promise<AdminEmployee>
  deleteEmployee(auth: AuthContext, publicId: string): Promise<AdminEmployeeDeleteResult>
  /** 管理端角色与权限总览 */
  adminRoles(auth: AuthContext, companyPublicId?: string): Promise<AdminRolesResult>
}
