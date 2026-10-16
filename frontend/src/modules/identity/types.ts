/** 组织与人员类型（与后端 identity 模块的契约保持一致） */

export interface Department {
  id: string
  name: string
}

export interface Member {
  id: string
  name: string
  employeeId: string
  position: string
  departmentId: string
  department: string
  email: string
  phone: string
}

export type AttendanceStatus = 'normal' | 'late' | 'absent'

export interface AttendanceDay {
  /** YYYY-MM-DD */
  date: string
  status: AttendanceStatus
}

export interface AttendanceResult {
  /** YYYY-MM */
  month: string
  /** 仅包含截至今日的已发生记录（周末无打卡） */
  days: AttendanceDay[]
}

export interface DirectoryResult {
  departments: Department[]
  members: Member[]
}
