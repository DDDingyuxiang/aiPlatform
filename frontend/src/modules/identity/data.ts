/**
 * 组织与人员演示数据（后端 identity 模块就绪后删除）。
 * 注意：成员 ID 与 core/auth/mock.ts 的演示账号、modules/chat 的会话参与者保持一致。
 */
import type { Department, Member } from './types'

export const DEPARTMENTS: Department[] = [
  { id: 'd-01', name: '综合管理部' },
  { id: 'd-02', name: '技术部' },
  { id: 'd-03', name: '市场部' },
  { id: 'd-04', name: '财务部' },
  { id: 'd-05', name: '采购部' },
]

export const MEMBERS: Member[] = [
  { id: 'u-001', name: '王立', employeeId: 'E1001', position: '数字化平台主管', departmentId: 'd-01', department: '综合管理部', email: 'wangli@example.com', phone: '13800001001' },
  { id: 'u-002', name: '李思', employeeId: 'E1024', position: '市场专员', departmentId: 'd-03', department: '市场部', email: 'lisi@example.com', phone: '13800001024' },
  { id: 'u-003', name: '孙悦', employeeId: 'E1003', position: '行政专员', departmentId: 'd-01', department: '综合管理部', email: 'sunyue@example.com', phone: '13800001003' },
  { id: 'u-004', name: '周雨薇', employeeId: 'E1004', position: '薪酬绩效专员', departmentId: 'd-01', department: '综合管理部', email: 'zhouyuwei@example.com', phone: '13800001004' },
  { id: 'u-010', name: '赵强', employeeId: 'E1010', position: '技术总监', departmentId: 'd-02', department: '技术部', email: 'zhaoqiang@example.com', phone: '13800001010' },
  { id: 'u-011', name: '陈晨', employeeId: 'E1011', position: '后端负责人', departmentId: 'd-02', department: '技术部', email: 'chenchen@example.com', phone: '13800001011' },
  { id: 'u-012', name: '吴科', employeeId: 'E1012', position: '算法工程师', departmentId: 'd-02', department: '技术部', email: 'wuke@example.com', phone: '13800001012' },
  { id: 'u-013', name: '郑楠', employeeId: 'E1013', position: '前端工程师', departmentId: 'd-02', department: '技术部', email: 'zhengnan@example.com', phone: '13800001013' },
  { id: 'u-020', name: '韩雪', employeeId: 'E1020', position: '市场经理', departmentId: 'd-03', department: '市场部', email: 'hanxue@example.com', phone: '13800001020' },
  { id: 'u-021', name: '顾南', employeeId: 'E1021', position: '品牌设计师', departmentId: 'd-03', department: '市场部', email: 'gunan@example.com', phone: '13800001021' },
  { id: 'u-030', name: '林芳', employeeId: 'E1030', position: '财务经理', departmentId: 'd-04', department: '财务部', email: 'linfang@example.com', phone: '13800001030' },
  { id: 'u-031', name: '徐涛', employeeId: 'E1031', position: '会计', departmentId: 'd-04', department: '财务部', email: 'xutao@example.com', phone: '13800001031' },
  { id: 'u-040', name: '沈佳', employeeId: 'E1040', position: '采购主管', departmentId: 'd-05', department: '采购部', email: 'shenjia@example.com', phone: '13800001040' },
  { id: 'u-041', name: '方圆', employeeId: 'E1041', position: '采购专员', departmentId: 'd-05', department: '采购部', email: 'fangyuan@example.com', phone: '13800001041' },
]
