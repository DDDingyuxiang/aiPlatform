/**
 * 工作台演示数据（仅用于前端演示，后端聚合接口就绪后删除本文件）。
 * 时间统一使用相对当前时间的 ISO 字符串，保证演示环境始终「新鲜」。
 */
import type {
  AiInsight,
  AnnouncementPreview,
  ApprovalPreview,
  KpiStat,
  TaskPreview,
  WeeklyProgress,
} from './types'

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function hoursLater(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

function daysLater(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

export const demoKpis: KpiStat[] = [
  { key: 'pendingTasks', value: 12, icon: 'tasks', tone: 'primary', delta: { direction: 'up', text: '+3' } },
  {
    key: 'pendingApprovals',
    value: 5,
    icon: 'workflow',
    tone: 'warning',
    delta: { direction: 'down', text: '-2' },
  },
  { key: 'unreadNotices', value: 8, icon: 'bell', tone: 'info' },
  { key: 'monthExpense', value: 624_000, format: 'currency', icon: 'expense', tone: 'success' },
]

export const demoApprovals: ApprovalPreview[] = [
  {
    id: 'ap-1',
    type: 'expense',
    title: '部门团建费用报销',
    applicant: '李思',
    department: '市场部',
    amountCent: 486_000,
    submittedAt: hoursAgo(1),
  },
  {
    id: 'ap-2',
    type: 'leave',
    title: '年假申请（10 月 20 日 - 24 日）',
    applicant: '赵强',
    department: '技术部',
    submittedAt: hoursAgo(3),
  },
  {
    id: 'ap-3',
    type: 'purchase',
    title: '研发测试服务器采购',
    applicant: '陈晨',
    department: '技术部',
    amountCent: 1_860_000,
    submittedAt: hoursAgo(5),
    urgent: true,
  },
  {
    id: 'ap-4',
    type: 'contract',
    title: '云服务续费合同签署',
    applicant: '孙悦',
    department: '采购部',
    amountCent: 960_000,
    submittedAt: daysAgo(1),
  },
]

export const demoTasks: TaskPreview[] = [
  { id: 'task-1', title: '完成 Q4 经营分析初稿', priority: 'high', dueAt: hoursLater(3), done: false },
  { id: 'task-2', title: '跟进服务器采购供应商报价', priority: 'high', dueAt: daysAgo(1), done: false },
  { id: 'task-3', title: '评审知识库文档分类方案', priority: 'medium', dueAt: daysLater(1), done: false },
  { id: 'task-4', title: '核对 9 月报销明细', priority: 'medium', dueAt: daysLater(1), done: false },
  { id: 'task-5', title: '整理本周部门例会纪要', priority: 'low', dueAt: daysLater(2), done: true },
]

export const demoAnnouncements: AnnouncementPreview[] = [
  {
    id: 'an-1',
    title: '《差旅费用报销标准》修订通知',
    category: 'policy',
    publishedAt: hoursAgo(4),
    unread: true,
    pinned: true,
  },
  {
    id: 'an-2',
    title: '第 43 期内部技术分享会报名开始',
    category: 'event',
    publishedAt: hoursAgo(26),
    unread: true,
  },
  {
    id: 'an-3',
    title: '办公区网络设备升级维护安排',
    category: 'system',
    publishedAt: daysAgo(3),
    unread: false,
  },
]

/** AI 洞察（演示文案；真实环境下由 AI 能力层生成，展示时需标注来源） */
export const demoInsights: AiInsight[] = [
  {
    id: 'insight-1',
    tone: 'warning',
    text: '3 笔差旅报销合计 ¥12,480，超出市场部本月预算的 82%，建议审批时确认预算来源。',
  },
  {
    id: 'insight-2',
    tone: 'positive',
    text: '本周任务完成率 67%，较上周提升 9 个百分点，其中技术部贡献 6 项。',
  },
  {
    id: 'insight-3',
    tone: 'info',
    text: '《差旅费用报销标准》文档 3 天前更新，涉及出差的同事可重新检索确认。',
  },
]

export const demoWeeklyProgress: WeeklyProgress = { done: 12, total: 18 }
