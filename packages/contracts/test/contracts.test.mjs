import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attendanceResultSchema,
  employeeSchema,
  loginPayloadSchema,
  monthSchema,
  userProfileSchema,
} from '../dist/index.js'

const profile = {
  id: '01J00000000000000000000002',
  username: 'admin',
  name: '王立',
  role: 'admin',
  employeeId: 'E1001',
  position: '数字化平台主管',
  department: '综合管理部',
  email: 'wangli@example.com',
  phone: '13800001001',
}

test('登录请求为 remember 提供默认值', () => {
  const parsed = loginPayloadSchema.parse({ username: 'admin', password: '123456' })
  assert.equal(parsed.remember, false)
})

test('用户资料字段与首页个人卡片一致', () => {
  assert.equal(userProfileSchema.parse(profile).name, '王立')
})

test('用户资料的 role 只接受系统角色', () => {
  assert.equal(userProfileSchema.safeParse({ ...profile, role: 'finance' }).success, false)
})

test('员工角色支持企业自定义角色代码', () => {
  const employee = {
    ...profile,
    status: 'active',
    departmentId: '1',
    roles: ['admin', 'finance'],
    createdAt: '2026-10-17T00:00:00Z',
    updatedAt: '2026-10-17T00:00:00Z',
  }
  assert.equal(employeeSchema.safeParse(employee).success, true)
})

test('月度考勤结构与首页日历一致', () => {
  const result = attendanceResultSchema.parse({
    month: '2026-10',
    days: [
      { date: '2026-10-01', status: 'normal' },
      { date: '2026-10-02', status: 'late' },
    ],
  })
  assert.equal(result.days.length, 2)
})

test('非法考勤状态与月份被拒绝', () => {
  assert.equal(
    attendanceResultSchema.safeParse({
      month: '2026-10',
      days: [{ date: '2026-10-01', status: 'leave' }],
    }).success,
    false,
  )
  assert.equal(monthSchema.safeParse('2026-13').success, false)
})
