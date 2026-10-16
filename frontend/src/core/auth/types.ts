/** 认证与用户信息类型（与后端 identity 模块的契约保持一致） */

export type RoleCode = 'admin' | 'employee'

export interface UserProfile {
  id: string
  username: string
  /** 显示姓名 */
  name: string
  role: RoleCode
  /** 工号 */
  employeeId: string
  /** 职位 */
  position: string
  department: string
  email: string
  phone: string
}

export interface LoginPayload {
  username: string
  password: string
  /** 记住我：令牌持久化到 localStorage */
  remember: boolean
}

export interface LoginResult {
  token: string
  user: UserProfile
}
