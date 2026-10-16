/**
 * 组织与考勤接口的 Mock 实现（演示数据，后端 identity 模块就绪后整体删除）。
 * 被 app/register-mocks.ts 按需动态导入，仅在 features.mockApi 开启时注册。
 */
import { defineMock } from '@/core/http'
import { DEPARTMENTS, MEMBERS } from './data'
import type { AttendanceDay, AttendanceResult, AttendanceStatus, DirectoryResult } from './types'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 生成当月考勤：仅生成截至今天的打卡记录（周末无记录），
 * 固定两天为迟到/缺勤以覆盖演示色板；真实环境由后端考勤系统提供。
 */
function buildAttendance(): AttendanceResult {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const days: AttendanceDay[] = []
  for (let day = 1; day <= now.getDate(); day += 1) {
    const date = new Date(year, month, day)
    const weekday = date.getDay()
    if (weekday === 0 || weekday === 6) continue
    let status: AttendanceStatus = 'normal'
    if (day === 6) status = 'late'
    if (day === 13) status = 'absent'
    days.push({ date: `${year}-${pad(month + 1)}-${pad(day)}`, status })
  }
  return { month: `${year}-${pad(month + 1)}`, days }
}

defineMock(
  'GET',
  '/identity/directory',
  (): DirectoryResult => ({ departments: DEPARTMENTS, members: MEMBERS }),
  { delayMs: 250 },
)

defineMock('GET', '/identity/attendance', () => buildAttendance(), { delayMs: 250 })
