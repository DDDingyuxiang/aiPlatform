import test from 'node:test'
import assert from 'node:assert/strict'
import {
  approvalItemSchema,
  attendanceResultSchema,
  createApprovalPayloadSchema,
  decisionPayloadSchema,
  employeeSchema,
  loginPayloadSchema,
  monthSchema,
  profileUpdateSchema,
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

const approval = {
  id: '01J00000000000000000000010',
  type: 'expense',
  title: '差旅费报销',
  applicant: { id: '01J00000000000000000000002', name: '李思', department: '市场部' },
  amountCent: 32000,
  submittedAt: '2026-10-17T08:00:00Z',
  status: 'pending',
  fields: [{ key: 'amount', label: '金额', value: '¥320.00' }],
  attachments: [{ id: '01J00000000000000000000011', name: '车票.pdf', sizeBytes: 102400 }],
  steps: [
    {
      id: '01J00000000000000000000012',
      nodeName: '提交申请',
      approver: { id: '01J00000000000000000000002', name: '李思' },
      status: 'done',
      actedAt: '2026-10-17T08:00:00Z',
    },
    {
      id: '01J00000000000000000000013',
      nodeName: '部门主管审批',
      approver: { id: '01J00000000000000000000001', name: '王立' },
      status: 'active',
    },
  ],
  currentApproverId: '01J00000000000000000000001',
  aiSummary: { highlights: ['票据齐全'] },
}

test('审批单结构与前端时间线一致，并允许 skipped 节点', () => {
  const parsed = approvalItemSchema.parse(approval)
  assert.equal(parsed.steps.length, 2)
  assert.equal(parsed.status, 'pending')

  const skipped = approvalItemSchema.parse({
    ...approval,
    steps: [{ ...approval.steps[0], status: 'skipped' }],
  })
  assert.equal(skipped.steps[0].status, 'skipped')
})

test('个人资料修改只接受可自助编辑字段', () => {
  assert.deepEqual(profileUpdateSchema.parse({ name: ' 王立 ', position: null, phone: '' }), {
    name: '王立',
    position: null,
    phone: '',
  })
  assert.equal(profileUpdateSchema.safeParse({ email: 'admin@example.com' }).success, true)
  assert.equal(profileUpdateSchema.safeParse({}).success, false)
  assert.equal(profileUpdateSchema.safeParse({ email: 'not-an-email' }).success, false)
  assert.equal(profileUpdateSchema.safeParse({ department: '技术部' }).success, false)
})

test('审批类型与状态只接受约定枚举', () => {
  assert.equal(approvalItemSchema.safeParse({ ...approval, type: 'travel' }).success, false)
  assert.equal(approvalItemSchema.safeParse({ ...approval, status: 'canceled' }).success, false)
})

test('发起审批默认字段为空数组', () => {
  const parsed = createApprovalPayloadSchema.parse({ type: 'leave', title: '年假申请' })
  assert.deepEqual(parsed.fields, [])
})

test('驳回必须填写审批意见，通过时意见可省略', () => {
  assert.equal(
    decisionPayloadSchema.safeParse({ action: 'reject', comment: '   ' }).success,
    false,
  )
  assert.equal(
    decisionPayloadSchema.safeParse({ action: 'reject', comment: '预算超限' }).success,
    true,
  )
  assert.equal(decisionPayloadSchema.parse({ action: 'approve' }).comment, '')
})
