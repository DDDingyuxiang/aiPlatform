/**
 * 审批接口的 Mock 实现（演示数据，后端 workflows 模块就绪后整体删除）。
 * 列表仅返回与我相关的单据（我发起的 / 流转到我处理过的 / 当前待我审批的）。
 */
import { defineMock, fail } from '@/core/http'
import { findMockUserId } from '@/core/auth/mock'
import { MEMBERS } from '@/modules/identity'
import { DEMO_APPROVALS, NEXT_NODE_BY_TYPE } from './data'
import type { ApprovalItem, CreateApprovalPayload, DecisionPayload } from './types'

const approvals: ApprovalItem[] = DEMO_APPROVALS.map((item) => ({
  ...item,
  steps: item.steps.map((step) => ({ ...step })),
  fields: item.fields.map((field) => ({ ...field })),
  attachments: [...item.attachments],
}))

function applicantOf(userId: string) {
  const member = MEMBERS.find((item) => item.id === userId)
  return { id: userId, name: member?.name ?? userId, department: member?.department ?? '' }
}

function requireUserId(token: string | null): string | null {
  return findMockUserId(token)
}

defineMock(
  'GET',
  '/workflows/approvals',
  ({ token }) => {
    const userId = requireUserId(token)
    if (!userId) return fail(40100, '登录状态已失效', 401)
    return approvals
      .filter(
        (item) =>
          item.applicant.id === userId ||
          item.currentApproverId === userId ||
          item.steps.some((step) => step.approver?.id === userId),
      )
      .map((item) => ({
        ...item,
        steps: item.steps.map((step) => ({ ...step })),
        fields: item.fields.map((field) => ({ ...field })),
        attachments: [...item.attachments],
      }))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  },
  { delayMs: 250 },
)

defineMock('POST', '/workflows/approvals', ({ body, token }) => {
  const userId = requireUserId(token)
  if (!userId) return fail(40100, '登录状态已失效', 401)
  const payload = body as CreateApprovalPayload | undefined
  if (!payload?.title || !payload?.type) return fail(40030, '审批事项信息不完整', 400)

  const next = NEXT_NODE_BY_TYPE[payload.type]
  const now = new Date().toISOString()
  const item: ApprovalItem = {
    id: `ap-${Date.now()}`,
    type: payload.type,
    title: payload.title,
    applicant: applicantOf(userId),
    amountCent: payload.amountCent,
    submittedAt: now,
    status: 'pending',
    fields: payload.fields.map((field) => ({ ...field })),
    attachments: [],
    steps: [
      { id: `st-${Date.now()}-1`, nodeName: '提交申请', approver: { id: userId, name: applicantOf(userId).name }, status: 'done', actedAt: now },
      {
        id: `st-${Date.now()}-2`,
        nodeName: next.nodeName,
        approver: { id: next.approverId, name: next.approverName },
        status: 'active',
      },
    ],
    currentApproverId: next.approverId,
    aiSummary: {
      highlights: [
        '由对话助手整理生成',
        ...payload.fields.slice(0, 2).map((field) => `${field.label}：${field.value}`),
      ],
    },
  }
  approvals.unshift(item)
  return { ...item, steps: item.steps.map((step) => ({ ...step })) }
})

defineMock('POST', '/workflows/approvals/:id/decision', ({ params, body, token }) => {
  const userId = requireUserId(token)
  if (!userId) return fail(40100, '登录状态已失效', 401)
  const item = approvals.find((approval) => approval.id === params.id)
  if (!item) return fail(40430, '审批单不存在', 404)
  if (item.status !== 'pending' || item.currentApproverId !== userId) {
    return fail(40930, '该事项当前不在你的待办中', 409)
  }
  const payload = body as DecisionPayload | undefined
  if (!payload?.action) return fail(40031, '缺少处理动作', 400)
  if (payload.action === 'reject' && !payload.comment?.trim()) {
    return fail(40032, '驳回时必须填写审批意见', 400)
  }

  const now = new Date().toISOString()
  const activeStep = item.steps.find(
    (step) => step.status === 'active' && step.approver?.id === userId,
  )
  if (!activeStep) return fail(40931, '未找到待处理的审批节点', 409)

  if (payload.action === 'reject') {
    activeStep.status = 'rejected'
    activeStep.comment = payload.comment.trim()
    activeStep.actedAt = now
    item.status = 'rejected'
    item.currentApproverId = undefined
  } else {
    activeStep.status = 'done'
    activeStep.comment = payload.comment.trim() || undefined
    activeStep.actedAt = now
    const nextStep = item.steps.find((step) => step.status === 'waiting')
    if (nextStep) {
      nextStep.status = 'active'
      item.currentApproverId = nextStep.approver?.id
    } else {
      item.status = 'approved'
      item.currentApproverId = undefined
    }
  }
  return { ...item, steps: item.steps.map((step) => ({ ...step })) }
})
