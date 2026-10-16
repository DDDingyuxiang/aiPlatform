/**
 * 知识库演示数据（后端 knowledge 模块就绪后删除）。
 * summary 为 AI 摘要演示文案（真实环境由 AI 能力层生成）。
 */
import type { KnowledgeDoc } from './types'

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

const LIN = { id: 'u-030', name: '林芳' }
const WANG = { id: 'u-001', name: '王立' }
const CHEN = { id: 'u-011', name: '陈晨' }
const HAN = { id: 'u-020', name: '韩雪' }
const GU = { id: 'u-021', name: '顾南' }
const SUN = { id: 'u-003', name: '孙悦' }

export const DEMO_DOCS: KnowledgeDoc[] = [
  {
    id: 'k-01',
    title: '差旅费用报销标准（2026 修订版）',
    category: 'policy',
    fileType: 'pdf',
    sizeBytes: 2_458_000,
    owner: LIN,
    department: '财务部',
    updatedAt: daysAgo(3),
    tags: ['报销', '差旅', '制度'],
    summary: '本文档规定了差旅交通、住宿与补贴的报销标准：住宿费按城市分级，一线城市上限 600 元/晚；电子发票可自动校验，纸质票据须在出差结束后 10 个工作日内提交。',
  },
  {
    id: 'k-02',
    title: '员工手册 2026',
    category: 'policy',
    fileType: 'pdf',
    sizeBytes: 5_120_000,
    owner: SUN,
    department: '综合管理部',
    updatedAt: daysAgo(12),
    tags: ['制度', '入职'],
    summary: '员工手册涵盖考勤、假期、绩效、行为规范与信息安全要求，其中考勤章节说明了迟到与缺勤的认定规则及申诉流程。',
  },
  {
    id: 'k-03',
    title: '智能工作流平台产品白皮书',
    category: 'product',
    fileType: 'pdf',
    sizeBytes: 8_640_000,
    owner: WANG,
    department: '综合管理部',
    updatedAt: daysAgo(6),
    tags: ['产品', '白皮书', '工作流'],
    summary: '白皮书阐述平台的模块化架构与 AI 能力层设计：统一模型路由、提示词版本管理与输出校验，业务模块通过受控接口请求 AI 能力。',
  },
  {
    id: 'k-04',
    title: '报销系统操作指南',
    category: 'product',
    fileType: 'pdf',
    sizeBytes: 1_860_000,
    owner: LIN,
    department: '财务部',
    updatedAt: daysAgo(9),
    tags: ['报销', '操作指南'],
    summary: '指南按「发起报销 → 上传发票 → 提交审批 → 财务复核 → 打款」的流程逐步说明操作要点，并列出常见驳回原因。',
  },
  {
    id: 'k-05',
    title: '审批流引擎技术设计文档',
    category: 'tech',
    fileType: 'doc',
    sizeBytes: 3_260_000,
    owner: CHEN,
    department: '技术部',
    updatedAt: daysAgo(2),
    tags: ['审批', '架构', '后端'],
    summary: '文档定义了审批流程的节点模型、会签/或签规则与状态机；强调关键状态变更需在事务中执行，并配合幂等策略处理重复提交。',
  },
  {
    id: 'k-06',
    title: '数据安全基线规范',
    category: 'tech',
    fileType: 'pdf',
    sizeBytes: 2_980_000,
    owner: CHEN,
    department: '技术部',
    updatedAt: daysAgo(15),
    tags: ['安全', '规范'],
    summary: '规范明确敏感数据分级、密钥管理与日志脱敏要求：密钥仅允许通过环境变量或密钥管理系统注入，禁止写入代码与版本库。',
  },
  {
    id: 'k-07',
    title: 'Q4 市场活动投放指南',
    category: 'market',
    fileType: 'ppt',
    sizeBytes: 12_400_000,
    owner: HAN,
    department: '市场部',
    updatedAt: daysAgo(4),
    tags: ['市场', '投放'],
    summary: '指南汇总 Q4 各渠道投放节奏与预算分配建议，指出内容营销渠道 ROI 高于行业均值 12%。',
  },
  {
    id: 'k-08',
    title: '品牌视觉规范手册',
    category: 'market',
    fileType: 'pdf',
    sizeBytes: 6_720_000,
    owner: GU,
    department: '市场部',
    updatedAt: daysAgo(20),
    tags: ['品牌', '设计'],
    summary: '手册规定了品牌主色、字体与版式栅格的使用方式，并提供对外材料的最小留白与字号约束。',
  },
  {
    id: 'k-09',
    title: '新人入职培训材料',
    category: 'training',
    fileType: 'ppt',
    sizeBytes: 9_180_000,
    owner: SUN,
    department: '综合管理部',
    updatedAt: daysAgo(8),
    tags: ['培训', '入职'],
    summary: '培训材料覆盖公司组织架构、常用系统（工作台/审批/知识库）与信息安全红线，附 30 天新人任务清单。',
  },
]
