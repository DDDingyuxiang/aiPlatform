import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adminEmployeeCreateSchema,
  adminEmployeeOptionsSchema,
  adminEmployeePageSchema,
  adminEmployeeUpdateSchema,
  adminRolesResultSchema,
  aiChatRequestSchema,
  aiChatResponseSchema,
  approvalItemSchema,
  chatMessageSchema,
  conversationSchema,
  createConversationSchema,
  sendMessageSchema,
  attendanceResultSchema,
  createApprovalPayloadSchema,
  decisionPayloadSchema,
  employeeSchema,
  extractedTaskSchema,
  taskCreatePayloadSchema,
  taskItemSchema,
  taskUpdatePayloadSchema,
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
  permissions: ['system.super_admin'],
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
  assert.equal(userProfileSchema.safeParse({ ...profile, role: 'super_admin' }).success, true)
})

test('用户资料必须携带权限码数组', () => {
  assert.equal(userProfileSchema.parse(profile).permissions[0], 'system.super_admin')
  assert.equal(userProfileSchema.safeParse({ ...profile, permissions: undefined }).success, false)
})

const company = {
  id: '01J00000000000000000000009',
  code: 'demo',
  name: '演示企业',
  status: 'active',
}

const employee = {
  id: profile.id,
  company,
  username: profile.username,
  employeeId: profile.employeeId,
  name: profile.name,
  position: profile.position,
  phone: profile.phone,
  email: profile.email,
  departmentId: '10',
  department: '综合管理部',
  roles: [{ code: 'admin', name: '管理员' }],
  status: 'active',
  createdAt: '2026-10-17T00:00:00Z',
  updatedAt: '2026-10-17T00:00:00Z',
}

test('管理端员工分页与选项契约', () => {
  const page = adminEmployeePageSchema.parse({
    items: [employee],
    total: 1,
    page: 1,
    pageSize: 20,
  })
  assert.equal(page.items[0].company.code, 'demo')

  const options = adminEmployeeOptionsSchema.parse({
    companies: [company],
    departments: [{ id: '10', name: '综合管理部' }],
    positions: ['数字化平台主管'],
    roles: [{ code: 'admin', name: '管理员' }],
  })
  assert.equal(options.departments[0].name, '综合管理部')
})

test('新建员工必须提供初始密码，更新禁止修改用户名/工号', () => {
  const payload = {
    username: 'zhangsan',
    employeeNo: 'E2001',
    email: 'zhangsan@example.com',
    name: '张三',
    departmentId: '10',
    roleCodes: ['employee'],
    initialPassword: '12345678',
  }
  assert.equal(adminEmployeeCreateSchema.safeParse(payload).success, true)
  assert.equal(
    adminEmployeeCreateSchema.safeParse({ ...payload, initialPassword: '123' }).success,
    false,
  )
  assert.equal(
    adminEmployeeUpdateSchema.safeParse({ status: 'disabled' }).success,
    true,
  )
  assert.equal(
    adminEmployeeUpdateSchema.safeParse({ username: 'other' }).success,
    false,
  )
})

test('任务契约支持任务对象、手工创建与 AI 抽取结果', () => {
  const task = taskItemSchema.parse({
    id: '01JTASK000000000000000001',
    title: '提交方案',
    description: '明天下午3点前发给同事',
    status: 'todo',
    priority: 'high',
    dueAt: '2026-10-19T15:00:00+08:00',
    assignee: { id: '01J00000000000000000000003', name: '王真' },
    creator: { id: '01J00000000000000000000002', name: '王立' },
    progress: 0,
  })
  assert.equal(task.status, 'todo')

  const payload = taskCreatePayloadSchema.parse({
    title: '提交方案',
    dueAt: '2026-10-19',
    assigneeId: '01J00000000000000000000003',
  })
  assert.equal(payload.priority, undefined)
  assert.equal(
    taskCreatePayloadSchema.safeParse({
      title: '提交方案',
      dueAt: '2026-10-19T15:00:00Z',
      assigneeId: '01J00000000000000000000003',
    }).success,
    false,
  )

  const extracted = extractedTaskSchema.parse({
    create: true,
    title: '提交方案',
    dueAt: '2026-10-19T15:00:00+08:00',
    priority: 'high',
    assigneeId: '01J00000000000000000000003',
  })
  assert.equal(extracted.create, true)
  assert.equal(extractedTaskSchema.safeParse({ create: false }).success, true)
})

test('任务更新契约支持分配者修改内容，且至少提交一项', () => {
  assert.equal(taskUpdatePayloadSchema.safeParse({}).success, false)
  assert.equal(taskUpdatePayloadSchema.safeParse({ title: '   ' }).success, false)

  const parsed = taskUpdatePayloadSchema.parse({
    title: ' 调整后的方案 ',
    description: '',
    dueAt: '2026-10-20',
    priority: 'low',
  })
  assert.equal(parsed.title, '调整后的方案')
  assert.equal(parsed.description, '')
  assert.equal(taskUpdatePayloadSchema.safeParse({ status: 'done' }).success, true)
  assert.equal(taskUpdatePayloadSchema.safeParse({ unknown: 1 }).success, false)
})

test('AI 对话契约限制历史条数与消息内容', () => {
  const request = aiChatRequestSchema.parse({
    messages: [{ role: 'user', content: '你好' }],
  })
  assert.equal(request.messages[0].role, 'user')
  assert.equal(aiChatRequestSchema.safeParse({ messages: [] }).success, false)
  assert.equal(
    aiChatRequestSchema.safeParse({ messages: [{ role: 'user', content: '   ' }] })
      .success,
    false,
  )

  const response = aiChatResponseSchema.parse({
    message: { role: 'assistant', content: '你好，有什么可以帮你？' },
    model: 'qwen3-local:latest',
  })
  assert.equal(response.model, 'qwen3-local:latest')
})

test('会话与消息契约支持文本与附件', () => {
  const conversation = conversationSchema.parse({
    id: '01J00000000000000000000020',
    type: 'direct',
    name: '李思',
    participants: [
      { id: '01J00000000000000000000002', name: '王立' },
      { id: '01J00000000000000000000003', name: '李思' },
    ],
    unread: 0,
    updatedAt: '2026-10-18T00:00:00Z',
    lastMessage: '[文件] 需求说明.txt',
  })
  assert.equal(conversation.participants.length, 2)

  const message = chatMessageSchema.parse({
    id: '1',
    conversationId: conversation.id,
    senderId: '01J00000000000000000000002',
    content: '请查收',
    type: 'file',
    attachments: [
      {
        id: '5',
        fileName: '需求说明.txt',
        mimeType: 'text/plain',
        sizeBytes: 58,
      },
    ],
    sentAt: '2026-10-18T00:00:00Z',
  })
  assert.equal(message.attachments[0].fileName, '需求说明.txt')
  assert.equal(chatMessageSchema.safeParse({ ...message, type: 'audio' }).success, false)
})

test('创建会话与发送消息的请求校验', () => {
  assert.equal(
    createConversationSchema.safeParse({ memberIds: ['01J00000000000000000000003'] }).success,
    true,
  )
  assert.equal(createConversationSchema.safeParse({ memberIds: [] }).success, false)
  assert.equal(sendMessageSchema.safeParse({ content: '   ' }).success, false)
  assert.equal(sendMessageSchema.safeParse({ content: '你好' }).success, true)
})

test('管理端角色总览契约', () => {
  const roles = adminRolesResultSchema.parse({
    roles: [
      {
        code: 'super_admin',
        name: '超级管理员',
        description: '',
        memberCount: 1,
        permissions: ['system.super_admin'],
      },
    ],
    permissions: [{ code: 'system.super_admin', description: '超级管理员权限' }],
  })
  assert.equal(roles.roles[0].memberCount, 1)
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
