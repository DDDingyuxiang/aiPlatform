/** 组织与考勤接口（经统一 HTTP 客户端，开发环境由 mock.ts 拦截） */
import { http } from '@/core/http'
import type { AttendanceResult, DirectoryResult } from './types'

export const identityApi = {
  directory: () => http.get<DirectoryResult>('/identity/directory'),
  attendance: () => http.get<AttendanceResult>('/identity/attendance'),
}
