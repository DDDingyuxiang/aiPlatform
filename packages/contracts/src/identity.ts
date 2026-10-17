/**
 * 组织与员工契约（identity 模块）。
 *
 * API 字段与前端 modules/identity、core/auth 现有字段保持一致：
 * - id：员工对外 public_id 或部门对外 ID（统一为字符串）
 * - employeeId：员工工号（对应 employees.employee_no）
 * - name：显示姓名（对应 employees.display_name）
 */
import { z } from 'zod'
import { apiIdSchema, isoDateTimeSchema, paginationQuerySchema } from './common.js'

/** 系统角色代码（与前端 auth.role.* 文案对应） */
export const systemRoleCodeSchema = z.enum(['admin', 'employee'])
export type SystemRoleCode = z.infer<typeof systemRoleCodeSchema>

/** 角色代码（支持企业自定义角色，对应 roles.code） */
export const roleCodeSchema = z.string().min(1).max(64)
export type RoleCodeValue = z.infer<typeof roleCodeSchema>

export const employeeStatusSchema = z.enum(['active', 'disabled', 'locked'])
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>

export const departmentStatusSchema = z.enum(['active', 'disabled'])
export type DepartmentStatus = z.infer<typeof departmentStatusSchema>

/** 目录中的部门简要信息 */
export const departmentSummarySchema = z.object({
  id: apiIdSchema,
  name: z.string().min(1).max(255),
})
export type Department = z.infer<typeof departmentSummarySchema>

/** 部门完整信息（部门 CRUD） */
export const departmentSchema = z.object({
  id: apiIdSchema,
  parentId: apiIdSchema.nullable(),
  name: z.string().min(1).max(255),
  status: departmentStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type DepartmentDetail = z.infer<typeof departmentSchema>

/** 通讯录成员（首页成员目录使用） */
export const memberSchema = z.object({
  id: apiIdSchema,
  name: z.string().min(1).max(128),
  employeeId: z.string().min(1).max(64),
  position: z.string().max(128),
  departmentId: apiIdSchema,
  department: z.string().max(255),
  email: z.email().max(255),
  phone: z.string().max(32),
})
export type Member = z.infer<typeof memberSchema>

/** 通讯录响应 */
export const directoryResultSchema = z.object({
  departments: z.array(departmentSummarySchema),
  members: z.array(memberSchema),
})
export type DirectoryResult = z.infer<typeof directoryResultSchema>

/** 员工完整信息（员工 CRUD） */
export const employeeSchema = z.object({
  id: apiIdSchema,
  username: z.string().min(1).max(64),
  employeeId: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  position: z.string().max(128).nullable(),
  phone: z.string().max(32).nullable(),
  email: z.email().max(255),
  status: employeeStatusSchema,
  departmentId: apiIdSchema.nullable(),
  department: z.string().max(255).nullable(),
  roles: z.array(roleCodeSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type Employee = z.infer<typeof employeeSchema>

/** 新建员工请求 */
export const employeeCreateSchema = z.strictObject({
  username: z.string().trim().min(1).max(64),
  employeeNo: z.string().trim().min(1).max(64),
  email: z.email().max(255),
  name: z.string().trim().min(1).max(128),
  position: z.string().trim().max(128).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  /** 主部门；不传表示暂不归属部门 */
  departmentId: apiIdSchema.nullable().optional(),
  roleCodes: z.array(roleCodeSchema).min(1).optional(),
})
export type EmployeeCreate = z.infer<typeof employeeCreateSchema>

/** 更新员工请求（所有字段可选） */
export const employeeUpdateSchema = employeeCreateSchema.partial()
export type EmployeeUpdate = z.infer<typeof employeeUpdateSchema>

/** 员工列表查询 */
export const employeeQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().min(1).max(128).optional(),
  departmentId: apiIdSchema.optional(),
  status: employeeStatusSchema.optional(),
})
export type EmployeeQuery = z.infer<typeof employeeQuerySchema>

/** 新建部门请求 */
export const departmentCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  parentId: apiIdSchema.nullable().optional(),
})
export type DepartmentCreate = z.infer<typeof departmentCreateSchema>

/** 更新部门请求 */
export const departmentUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(255).optional(),
  parentId: apiIdSchema.nullable().optional(),
  status: departmentStatusSchema.optional(),
})
export type DepartmentUpdate = z.infer<typeof departmentUpdateSchema>
