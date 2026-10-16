/**
 * 公告演示数据（后端 announcements 模块就绪后删除）。
 * 可见范围：company 全员可见；department 仅对应部门可见；colleague 全员可见。
 */
import type { Announcement } from './types'

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

const SUN = { id: 'u-003', name: '孙悦' }
const ZHOU = { id: 'u-004', name: '周雨薇' }
const ZHAO = { id: 'u-010', name: '赵强' }
const HAN = { id: 'u-020', name: '韩雪' }
const GU = { id: 'u-021', name: '顾南' }
const WU = { id: 'u-012', name: '吴科' }
const LIN = { id: 'u-030', name: '林芳' }

export const DEMO_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'an-01',
    title: '《差旅费用报销标准》修订通知',
    paragraphs: [
      '为简化报销流程、统一费用口径，公司对《差旅费用报销标准》进行了修订，自本通知发布之日起施行。',
      '主要调整：交通费按实际发生额报销，住宿费标准按城市分级上调 10%；新增电子发票自动校验流程，纸质票据请于出差结束后 10 个工作日内提交。',
      '各部门负责人请在审批时按新标准执行，如有疑问请联系财务部。',
    ],
    scope: 'company',
    publisher: LIN,
    publishedAt: hoursAgo(4),
    read: false,
    pinned: true,
    attachments: [{ id: 'att-01', name: '差旅费用报销标准（2026 修订版）.pdf', sizeBytes: 2_458_000 }],
  },
  {
    id: 'an-02',
    title: '办公区网络设备升级维护安排',
    paragraphs: [
      '本周六 20:00 至周日 06:00 将对办公区核心交换设备进行升级，期间内网及办公系统将间歇性不可用。',
      '请各部门提前保存工作内容，避免在维护窗口内提交重要审批事项。',
    ],
    scope: 'company',
    publisher: ZHAO,
    publishedAt: hoursAgo(26),
    read: false,
    attachments: [],
  },
  {
    id: 'an-03',
    title: '2026 年会活动方案征集',
    paragraphs: [
      '公司年会筹备工作正式启动，现面向全员征集活动方案与节目创意。',
      '请于 11 月 15 日前将方案发送至市场部韩雪处，入选方案将获得专项预算支持。',
    ],
    scope: 'company',
    publisher: HAN,
    publishedAt: daysAgo(3),
    read: true,
    attachments: [],
  },
  {
    id: 'an-04',
    title: '部门例会调整至每周三上午',
    paragraphs: [
      '因 Q4 会议安排调整，综合管理部周例会自本周起调整至每周三 10:00，会议室为 3F-302。',
      '请各位提前准备上周工作小结与本周计划。',
    ],
    scope: 'department',
    department: '综合管理部',
    publisher: ZHOU,
    publishedAt: hoursAgo(30),
    read: false,
    attachments: [],
  },
  {
    id: 'an-05',
    title: 'Q4 办公用品申领开始',
    paragraphs: ['Q4 办公用品集中申领已开放，请在本周五前通过行政服务号提交需求，逾期顺延至下一季度。'],
    scope: 'department',
    department: '综合管理部',
    publisher: SUN,
    publishedAt: daysAgo(2),
    read: true,
    attachments: [],
  },
  {
    id: 'an-06',
    title: '市场部 Q4 团建活动报名',
    paragraphs: [
      '市场部 Q4 团建定于下月中旬举行，两天一夜，目的地为莫干山。',
      '请部门同事在本周内完成报名，便于统一预订行程。',
    ],
    scope: 'department',
    department: '市场部',
    publisher: HAN,
    publishedAt: hoursAgo(8),
    read: false,
    attachments: [],
  },
  {
    id: 'an-07',
    title: '内部技术分享会第 43 期报名',
    paragraphs: [
      '本期分享主题为「大模型应用中的提示词工程与评测」，由算法组吴科主讲。',
      '时间：本周五 16:00，地点：5F 阶梯会议室，欢迎感兴趣的同事报名参加。',
    ],
    scope: 'colleague',
    publisher: ZHAO,
    publishedAt: hoursAgo(10),
    read: false,
    attachments: [],
  },
  {
    id: 'an-08',
    title: '设计规范工作坊邀请',
    paragraphs: ['本周四下午将举办组件设计规范工作坊，欢迎产品与研发同学参加，共同讨论组件库的落地细节。'],
    scope: 'colleague',
    publisher: GU,
    publishedAt: daysAgo(4),
    read: true,
    attachments: [],
  },
  {
    id: 'an-09',
    title: '知识库文档模板更新说明',
    paragraphs: ['知识库常用文档模板已完成一轮更新，新增需求文档与复盘模板，请在「知识库」中检索使用。'],
    scope: 'colleague',
    publisher: WU,
    publishedAt: daysAgo(6),
    read: true,
    attachments: [],
  },
]
