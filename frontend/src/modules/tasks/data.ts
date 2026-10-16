/**
 * 任务与里程碑演示数据（后端 tasks 模块就绪后删除）。
 * 人员引用与 modules/identity/data.ts 对齐；视角以演示账号 u-001（王立）为基准。
 */
import type { Milestone, TaskItem } from './types'

function hoursLater(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

function daysLater(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

const WANG = { id: 'u-001', name: '王立' }
const LISI = { id: 'u-002', name: '李思' }
const ZHAO = { id: 'u-010', name: '赵强' }
const CHEN = { id: 'u-011', name: '陈晨' }
const WU = { id: 'u-012', name: '吴科' }
const ZHENG = { id: 'u-013', name: '郑楠' }

export const DEMO_MILESTONES: Milestone[] = [
  {
    id: 'ms-01',
    name: 'IT 基础设施升级',
    project: '平台运维',
    owner: ZHAO,
    dueAt: daysLater(10),
    status: 'inProgress',
    totalTasks: 5,
    doneTasks: 2,
  },
  {
    id: 'ms-02',
    name: '产品迭代 V2',
    project: '智能工作流平台',
    owner: WANG,
    dueAt: daysLater(20),
    status: 'inProgress',
    totalTasks: 8,
    doneTasks: 3,
  },
  {
    id: 'ms-03',
    name: 'Q4 经营复盘',
    project: '经营分析',
    owner: WANG,
    dueAt: daysLater(7),
    status: 'upcoming',
    totalTasks: 4,
    doneTasks: 1,
  },
  {
    id: 'ms-04',
    name: '年度合规审计',
    project: '内控合规',
    owner: { id: 'u-030', name: '林芳' },
    dueAt: daysAgo(5),
    status: 'done',
    totalTasks: 6,
    doneTasks: 6,
  },
]

export const DEMO_TASKS: TaskItem[] = [
  {
    id: 't-01',
    title: '完成 Q4 经营分析初稿',
    description: '汇总各业务线 Q4 收入、成本与回款数据，输出初稿并同步管理层评审。',
    status: 'inProgress',
    priority: 'high',
    dueAt: hoursLater(3),
    assignee: WANG,
    creator: WANG,
    progress: 60,
    milestoneId: 'ms-03',
    milestoneName: 'Q4 经营复盘',
  },
  {
    id: 't-02',
    title: '跟进服务器采购供应商报价',
    description: '对比三家供应商的报价与交付周期，确认技术参数后提交采购审批。',
    status: 'todo',
    priority: 'high',
    dueAt: daysAgo(1),
    assignee: WANG,
    creator: ZHAO,
    progress: 10,
    milestoneId: 'ms-01',
    milestoneName: 'IT 基础设施升级',
  },
  {
    id: 't-03',
    title: '评审知识库文档分类方案',
    description: '评审行政部提交的文档分类与标签体系方案，给出调整意见。',
    status: 'todo',
    priority: 'medium',
    dueAt: daysLater(1),
    assignee: WANG,
    creator: WANG,
    progress: 0,
  },
  {
    id: 't-04',
    title: '核对 9 月报销明细',
    description: '核对 9 月市场部与销售部报销明细，标记异常单并反馈财务。',
    status: 'inProgress',
    priority: 'medium',
    dueAt: daysLater(1),
    assignee: WANG,
    creator: WANG,
    progress: 30,
  },
  {
    id: 't-05',
    title: '整理本周部门例会纪要',
    description: '整理本周综合管理部例会纪要并同步参会人。',
    status: 'done',
    priority: 'low',
    dueAt: daysLater(2),
    assignee: WANG,
    creator: WANG,
    progress: 100,
  },
  {
    id: 't-06',
    title: '更新平台迭代路线图',
    description: '结合二季度反馈更新平台迭代路线图，标注优先级调整项。',
    status: 'todo',
    priority: 'medium',
    dueAt: daysLater(3),
    assignee: WANG,
    creator: WANG,
    progress: 0,
    milestoneId: 'ms-02',
    milestoneName: '产品迭代 V2',
  },
  {
    id: 't-07',
    title: '设计新版报销单页面原型',
    description: '按移动端优先原则设计报销单表单与审批轨迹页面原型。',
    status: 'inProgress',
    priority: 'high',
    dueAt: daysLater(2),
    assignee: ZHENG,
    creator: WANG,
    progress: 45,
    milestoneId: 'ms-02',
    milestoneName: '产品迭代 V2',
  },
  {
    id: 't-08',
    title: '完成审批流引擎接口联调',
    description: '完成审批流引擎与前端管理台的接口联调与异常分支自测。',
    status: 'inProgress',
    priority: 'medium',
    dueAt: daysLater(4),
    assignee: CHEN,
    creator: WANG,
    progress: 70,
    milestoneId: 'ms-02',
    milestoneName: '产品迭代 V2',
  },
  {
    id: 't-09',
    title: '编写知识库上传接口文档',
    description: '补全知识库上传接口的参数、错误码与限流说明。',
    status: 'todo',
    priority: 'low',
    dueAt: daysLater(5),
    assignee: WU,
    creator: WANG,
    progress: 0,
  },
  {
    id: 't-10',
    title: '准备市场部物料评审材料',
    description: '整理市场部 Q4 物料清单与预算，供评审会使用。',
    status: 'done',
    priority: 'medium',
    dueAt: daysAgo(2),
    assignee: LISI,
    creator: WANG,
    progress: 100,
  },
  {
    id: 't-11',
    title: '排查消息推送偶发延迟',
    description: '排查会话消息推送偶发延迟问题，输出根因分析。',
    status: 'todo',
    priority: 'high',
    dueAt: hoursAgo(2),
    assignee: CHEN,
    creator: ZHAO,
    progress: 0,
    milestoneId: 'ms-01',
    milestoneName: 'IT 基础设施升级',
  },
]
