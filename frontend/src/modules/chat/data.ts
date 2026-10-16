/**
 * 对话演示数据（后端 conversations 模块就绪后删除）。
 * 参与者 ID 与 modules/identity/data.ts 的成员数据对齐。
 */
import type { Conversation, Message } from './types'

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

const P = {
  wangli: { id: 'u-001', name: '王立' },
  lisi: { id: 'u-002', name: '李思' },
  zhaoqiang: { id: 'u-010', name: '赵强' },
  chenchen: { id: 'u-011', name: '陈晨' },
  linfang: { id: 'u-030', name: '林芳' },
  shenjia: { id: 'u-040', name: '沈佳' },
} as const

export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    id: 'c-101',
    type: 'direct',
    name: '李思',
    participants: [P.wangli, P.lisi],
    unread: 1,
    updatedAt: hoursAgo(0.5),
    lastMessage: '好的～另外这周五的评审会需要我做汇报吗？',
  },
  {
    id: 'c-102',
    type: 'direct',
    name: '赵强',
    participants: [P.wangli, P.zhaoqiang],
    unread: 0,
    updatedAt: hoursAgo(26),
    lastMessage: '好，审批的时候把比价单也附上',
  },
  {
    id: 'c-103',
    type: 'direct',
    name: '林芳',
    participants: [P.wangli, P.linfang],
    unread: 2,
    updatedAt: hoursAgo(3),
    lastMessage: '还有几笔待审的单子麻烦尽快看一下',
  },
  {
    id: 'c-201',
    type: 'group',
    name: '产品迭代周会',
    participants: [P.wangli, P.lisi, P.zhaoqiang, P.chenchen],
    unread: 3,
    updatedAt: hoursAgo(1),
    lastMessage: '市场侧的宣传物料周五前交付',
  },
  {
    id: 'c-202',
    type: 'group',
    name: '差旅报销讨论组',
    participants: [P.wangli, P.lisi, P.linfang, P.shenjia],
    unread: 0,
    updatedAt: daysAgo(2),
    lastMessage: '收到',
  },
]

export const DEMO_MESSAGES: Record<string, Message[]> = {
  'c-101': [
    { id: 'm-1011', conversationId: 'c-101', senderId: 'u-002', content: '王哥，市场部这周的活动物料需求整理好了，文件发你邮箱了', sentAt: hoursAgo(2) },
    { id: 'm-1012', conversationId: 'c-101', senderId: 'u-001', content: '收到，我下午过一遍', sentAt: hoursAgo(1.5) },
    { id: 'm-1013', conversationId: 'c-101', senderId: 'u-002', content: '好的～另外这周五的评审会需要我做汇报吗？', sentAt: hoursAgo(0.5) },
  ],
  'c-102': [
    { id: 'm-1021', conversationId: 'c-102', senderId: 'u-010', content: '服务器采购的技术参数已经确认，明天提交审批流程', sentAt: hoursAgo(27) },
    { id: 'm-1022', conversationId: 'c-102', senderId: 'u-001', content: '好，审批的时候把比价单也附上', sentAt: hoursAgo(26) },
  ],
  'c-103': [
    { id: 'm-1031', conversationId: 'c-103', senderId: 'u-030', content: '《差旅报销标准》更新了，9 月之后的单子按新标准复核', sentAt: hoursAgo(4) },
    { id: 'm-1032', conversationId: 'c-103', senderId: 'u-030', content: '还有几笔待审的单子麻烦尽快看一下', sentAt: hoursAgo(3) },
  ],
  'c-201': [
    { id: 'm-2011', conversationId: 'c-201', senderId: 'u-010', content: '本周迭代计划已经更新到看板，大家看下', sentAt: hoursAgo(3) },
    { id: 'm-2012', conversationId: 'c-201', senderId: 'u-011', content: '后端接口周三前可以完成联调', sentAt: hoursAgo(2) },
    { id: 'm-2013', conversationId: 'c-201', senderId: 'u-002', content: '市场侧的宣传物料周五前交付', sentAt: hoursAgo(1) },
  ],
  'c-202': [
    { id: 'm-2021', conversationId: 'c-202', senderId: 'u-030', content: '新版报销标准已发布，有问题在这里集中反馈', sentAt: daysAgo(2) },
    { id: 'm-2022', conversationId: 'c-202', senderId: 'u-040', content: '收到', sentAt: daysAgo(2) },
  ],
}

/** 演示期自动回复池（真实环境由消息推送/人工回复替代，本逻辑将连同 mock 一起删除） */
const REPLY_POOL = [
  '收到，我看一下',
  '好的，稍后同步给你',
  '没问题，按这个来',
  '了解，我这边安排一下',
  '好的，有进展我随时说',
]

export function pickDemoReply(): string {
  return REPLY_POOL[Math.floor(Math.random() * REPLY_POOL.length)] ?? REPLY_POOL[0] ?? ''
}
