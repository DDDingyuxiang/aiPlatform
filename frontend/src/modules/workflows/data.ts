/**
 * 审批演示数据（后端 workflows 模块就绪后删除）。
 * 人员与 modules/identity/data.ts 对齐；视角以演示账号 u-001（王立）为基准。
 * aiSummary 为 AI 摘要演示文案（真实环境由 AI 能力层生成）。
 */
import type { ApprovalItem } from './types'

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

const WANG = { id: 'u-001', name: '王立', department: '综合管理部' }
const LISI = { id: 'u-002', name: '李思', department: '市场部' }
const ZHOU = { id: 'u-004', name: '周雨薇', department: '综合管理部' }
const ZHAO = { id: 'u-010', name: '赵强', department: '技术部' }
const CHEN = { id: 'u-011', name: '陈晨', department: '技术部' }
const SUN = { id: 'u-003', name: '孙悦', department: '综合管理部' }
const LIN = { id: 'u-030', name: '林芳', department: '财务部' }
const SHEN = { id: 'u-040', name: '沈佳', department: '采购部' }

export const DEMO_APPROVALS: ApprovalItem[] = [
  {
    id: 'ap-01',
    type: 'expense',
    title: '部门团建费用报销',
    applicant: LISI,
    amountCent: 486_000,
    submittedAt: hoursAgo(1),
    status: 'pending',
    currentApproverId: 'u-001',
    fields: [
      { key: 'category', label: '费用类型', value: '团建活动' },
      { key: 'amount', label: '金额', value: '¥4,860.00' },
      { key: 'date', label: '费用日期', value: '2026-10-12' },
      { key: 'reason', label: '事由', value: '市场部 Q4 团建活动场地与餐饮费用' },
    ],
    attachments: [
      { id: 'att-101', name: '发票-团建场地.pdf', sizeBytes: 1_240_000 },
      { id: 'att-102', name: '发票-餐饮明细.pdf', sizeBytes: 860_000 },
    ],
    steps: [
      { id: 'st-101', nodeName: '提交申请', approver: LISI, status: 'done', actedAt: hoursAgo(1) },
      { id: 'st-102', nodeName: '部门主管审批', approver: WANG, status: 'active' },
      { id: 'st-103', nodeName: '财务复核', approver: LIN, status: 'waiting' },
    ],
    aiSummary: {
      highlights: [
        '市场部团建活动费用，合计 ¥4,860',
        '占市场部 Q4 活动预算的 82%',
        '申请人近 3 个月无同类报销记录',
      ],
      risk: '超出部门单次团建 4,000 元软上限，建议确认预算来源',
    },
  },
  {
    id: 'ap-02',
    type: 'leave',
    title: '年假申请（10 月 20 日 - 24 日）',
    applicant: ZHAO,
    submittedAt: hoursAgo(3),
    status: 'pending',
    currentApproverId: 'u-001',
    fields: [
      { key: 'leaveType', label: '请假类型', value: '年假' },
      { key: 'startDate', label: '开始日期', value: '2026-10-20' },
      { key: 'days', label: '天数', value: '5 天' },
      { key: 'reason', label: '事由', value: '个人休假，已安排好工作交接' },
    ],
    attachments: [],
    steps: [
      { id: 'st-201', nodeName: '提交申请', approver: ZHAO, status: 'done', actedAt: hoursAgo(3) },
      { id: 'st-202', nodeName: '部门主管审批', approver: WANG, status: 'active' },
      { id: 'st-203', nodeName: '人事备案', approver: ZHOU, status: 'waiting' },
    ],
    aiSummary: {
      highlights: ['年假共 5 天（10/20 - 10/24）', '本年度累计休假 12 天', '期间无关键里程碑交付'],
      risk: '10 月 22 日有迭代评审会，建议与申请人确认工作交接安排',
    },
  },
  {
    id: 'ap-03',
    type: 'purchase',
    title: '研发测试服务器采购',
    applicant: CHEN,
    amountCent: 1_860_000,
    submittedAt: hoursAgo(5),
    status: 'pending',
    urgent: true,
    currentApproverId: 'u-001',
    fields: [
      { key: 'item', label: '采购物品', value: '测试服务器 × 3' },
      { key: 'amount', label: '金额', value: '¥18,600.00' },
      { key: 'supplier', label: '供应商', value: '华云科技' },
      { key: 'reason', label: '用途', value: '性能压测环境扩容' },
    ],
    attachments: [{ id: 'att-301', name: '三家供应商比价单.pdf', sizeBytes: 2_100_000 }],
    steps: [
      { id: 'st-301', nodeName: '提交申请', approver: CHEN, status: 'done', actedAt: hoursAgo(5) },
      { id: 'st-302', nodeName: '部门主管审批', approver: WANG, status: 'active' },
      { id: 'st-303', nodeName: '财务复核', approver: LIN, status: 'waiting' },
    ],
    aiSummary: {
      highlights: ['采购 3 台测试服务器，金额 ¥18,600', '已附三家比价单，价格差异 6%', '技术参数经赵强确认'],
      risk: '金额超过 1 万元，财务复核通过后方可执行',
    },
  },
  {
    id: 'ap-04',
    type: 'contract',
    title: '云服务续费合同签署',
    applicant: SUN,
    amountCent: 960_000,
    submittedAt: hoursAgo(26),
    status: 'pending',
    currentApproverId: 'u-001',
    fields: [
      { key: 'partner', label: '对方主体', value: '青云云计算有限公司' },
      { key: 'amount', label: '合同金额', value: '¥9,600.00' },
      { key: 'term', label: '合同期限', value: '2026-11-01 至 2027-10-31' },
      { key: 'reason', label: '续费说明', value: '云主机与对象存储年度续费' },
    ],
    attachments: [{ id: 'att-401', name: '续费合同（拟稿）.pdf', sizeBytes: 640_000 }],
    steps: [
      { id: 'st-401', nodeName: '提交申请', approver: SUN, status: 'done', actedAt: hoursAgo(26) },
      { id: 'st-402', nodeName: '部门主管审批', approver: WANG, status: 'active' },
      { id: 'st-403', nodeName: '财务复核', approver: LIN, status: 'waiting' },
    ],
    aiSummary: {
      highlights: ['云服务年度续费，金额 ¥9,600', '服务期 12 个月，价格与上期持平', '付款方式为年付'],
    },
  },
  {
    id: 'ap-05',
    type: 'expense',
    title: '客户拜访差旅报销',
    applicant: WANG,
    amountCent: 128_500,
    submittedAt: daysAgo(1),
    status: 'pending',
    currentApproverId: 'u-030',
    fields: [
      { key: 'category', label: '费用类型', value: '差旅' },
      { key: 'amount', label: '金额', value: '¥1,285.00' },
      { key: 'date', label: '费用日期', value: '2026-10-13' },
      { key: 'reason', label: '事由', value: '拜访重点客户的交通与住宿费用' },
    ],
    attachments: [{ id: 'att-501', name: '发票-高铁票.pdf', sizeBytes: 220_000 }],
    steps: [
      { id: 'st-501', nodeName: '提交申请', approver: WANG, status: 'done', actedAt: daysAgo(1) },
      { id: 'st-502', nodeName: '财务复核', approver: LIN, status: 'active' },
    ],
    aiSummary: {
      highlights: ['差旅交通与住宿合计 ¥1,285', '符合新版差旅费用报销标准'],
    },
  },
  {
    id: 'ap-06',
    type: 'leave',
    title: '调休申请（10 月 9 日）',
    applicant: WANG,
    submittedAt: daysAgo(3),
    status: 'approved',
    fields: [
      { key: 'leaveType', label: '请假类型', value: '调休' },
      { key: 'startDate', label: '开始日期', value: '2026-10-09' },
      { key: 'days', label: '天数', value: '1 天' },
      { key: 'reason', label: '事由', value: '上周六加班调休' },
    ],
    attachments: [],
    steps: [
      { id: 'st-601', nodeName: '提交申请', approver: WANG, status: 'done', actedAt: daysAgo(3) },
      { id: 'st-602', nodeName: '部门主管审批', approver: ZHAO, status: 'done', comment: '同意', actedAt: daysAgo(3) },
      { id: 'st-603', nodeName: '人事备案', approver: ZHOU, status: 'done', comment: '已备案', actedAt: daysAgo(2) },
    ],
    aiSummary: { highlights: ['调休 1 天，不占用年假额度'] },
  },
  {
    id: 'ap-07',
    type: 'expense',
    title: '办公用品采购报销',
    applicant: ZHOU,
    amountCent: 32_000,
    submittedAt: daysAgo(2),
    status: 'approved',
    fields: [
      { key: 'category', label: '费用类型', value: '办公用品' },
      { key: 'amount', label: '金额', value: '¥320.00' },
      { key: 'date', label: '费用日期', value: '2026-10-11' },
      { key: 'reason', label: '事由', value: '打印纸与文具补充采购' },
    ],
    attachments: [{ id: 'att-701', name: '发票-办公用品.pdf', sizeBytes: 180_000 }],
    steps: [
      { id: 'st-701', nodeName: '提交申请', approver: ZHOU, status: 'done', actedAt: daysAgo(2) },
      { id: 'st-702', nodeName: '部门主管审批', approver: WANG, status: 'done', comment: '同意', actedAt: daysAgo(2) },
      { id: 'st-703', nodeName: '财务复核', approver: LIN, status: 'done', comment: '已复核，下次批量打款', actedAt: daysAgo(1) },
    ],
    aiSummary: { highlights: ['办公用品小额报销 ¥320，票据齐全'] },
  },
  {
    id: 'ap-08',
    type: 'purchase',
    title: '打印耗材采购申请',
    applicant: SHEN,
    amountCent: 45_000,
    submittedAt: daysAgo(1),
    status: 'rejected',
    fields: [
      { key: 'item', label: '采购物品', value: '打印机硒鼓 × 4' },
      { key: 'amount', label: '金额', value: '¥450.00' },
      { key: 'supplier', label: '供应商', value: '晨光办公' },
      { key: 'reason', label: '用途', value: '各部门打印机耗材补充' },
    ],
    attachments: [],
    steps: [
      { id: 'st-801', nodeName: '提交申请', approver: SHEN, status: 'done', actedAt: daysAgo(1) },
      {
        id: 'st-802',
        nodeName: '部门主管审批',
        approver: WANG,
        status: 'rejected',
        comment: '请补充三家供应商比价后再提交',
        actedAt: daysAgo(1),
      },
      { id: 'st-803', nodeName: '财务复核', approver: LIN, status: 'waiting' },
    ],
    aiSummary: { highlights: ['硒鼓采购 ¥450，未附比价材料'] },
  },
]

/** 对话式创建后，不同类型事项的下一审批节点（演示规则） */
export const NEXT_NODE_BY_TYPE: Record<
  ApprovalItem['type'],
  { nodeName: string; approverId: string; approverName: string }
> = {
  expense: { nodeName: '财务复核', approverId: 'u-030', approverName: '林芳' },
  leave: { nodeName: '人事备案', approverId: 'u-004', approverName: '周雨薇' },
  purchase: { nodeName: '技术评估', approverId: 'u-010', approverName: '赵强' },
  contract: { nodeName: '财务复核', approverId: 'u-030', approverName: '林芳' },
}
