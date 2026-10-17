/**
 * 管理端契约：员工管理、公司/部门/角色选项与角色总览。
 *
 * 访问权限：
 * - system.super_admin：平台公司内的超管，可跨公司；
 * - system.employee.manage：本企业管理员，只能操作当前公司。
 * 后端必须强制执行上述范围，前端筛选只是体验。
 */
import { z } from 'zod'
import { apiIdSchema, isoDateTimeSchema, paginationQuerySchema } from './common.js'
import {
  departmentSummarySchema,
  employeeStatusSchema,
  permissionCodeSchema,
  roleCodeSchema,
} from './identity.js'

/** 员工所属角色（code 用于判断，name 用于展示） */
export const adminRoleRefSchema = z.object({
  code: roleCodeSchema,
  name: z.string().min(1).max(64),
})
export type AdminRoleRef = z.infer<typeof adminRoleRefSchema>

export const companyStatusSchema = z.enum(['active', 'suspended', 'disabled'])
export type CompanyStatus = z.infer<typeof companyStatusSchema>

/** 对外公司摘要（id 为 companies.public_id） */
export const companySummarySchema = z.object({
  id: apiIdSchema,
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  status: companyStatusSchema,
})
export type CompanySummary = z.infer<typeof companySummarySchema>

/** 管理端员工完整信息 */
export const adminEmployeeSchema = z.object({
  id: apiIdSchema,
  company: companySummarySchema,
  username: z.string().min(1).max(64),
  employeeId: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  position: z.string().max(128),
  phone: z.string().max(32),
  email: z.email().max(255),
  departmentId: apiIdSchema.nullable(),
  department: z.string().max(255),
  roles: z.array(adminRoleRefSchema),
  status: employeeStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type AdminEmployee = z.infer<typeof adminEmployeeSchema>

/** 员工列表查询（分页 + 公司/部门/职位/状态/关键字） */
export const adminEmployeeQuerySchema = paginationQuerySchema.extend({
  companyId: apiIdSchema.optional(),
  departmentId: apiIdSchema.optional(),
  position: z.string().trim().min(1).max(128).optional(),
  status: employeeStatusSchema.optional(),
  keyword: z.string().trim().min(1).max(128).optional(),
})
export type AdminEmployeeQuery = z.infer<typeof adminEmployeeQuerySchema>

/** 员工分页结果 */
export const adminEmployeePageSchema = z.object({
  items: z.array(adminEmployeeSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})
export type AdminEmployeePage = z.infer<typeof adminEmployeePageSchema>

/** 新建员工（初始密码只写入凭据表，绝不回显） */
export const adminEmployeeCreateSchema = z.strictObject({
  /** 平台超管必填；公司管理员固定为当前公司 */
  companyId: apiIdSchema.optional(),
  username: z.string().trim().min(1).max(64),
  employeeNo: z.string().trim().min(1).max(64),
  email: z.email().max(255),
  name: z.string().trim().min(1).max(128),
  position: z.string().trim().max(128).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  departmentId: apiIdSchema.nullable().optional(),
  roleCodes: z.array(roleCodeSchema).optional(),
  initialPassword: z.string().min(8).max(128),
})
export type AdminEmployeeCreate = z.infer<typeof adminEmployeeCreateSchema>

/** 更新员工：用户名与工号不可修改 */
export const adminEmployeeUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(128).optional(),
    email: z.email().max(255).optional(),
    position: z.string().trim().max(128).nullable().optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    departmentId: apiIdSchema.nullable().optional(),
    roleCodes: z.array(roleCodeSchema).optional(),
    status: employeeStatusSchema.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: '至少提交一个需要修改的字段',
  })
export type AdminEmployeeUpdate = z.infer<typeof adminEmployeeUpdateSchema>

/** 员工管理选项：公司、所选公司的部门/职位/角色 */
export const adminEmployeeOptionsSchema = z.object({
  companies: z.array(companySummarySchema),
  departments: z.array(departmentSummarySchema),
  positions: z.array(z.string().min(1).max(128)),
  roles: z.array(adminRoleRefSchema),
})
export type AdminEmployeeOptions = z.infer<typeof adminEmployeeOptionsSchema>

export const adminEmployeeOptionsQuerySchema = z.strictObject({
  companyId: apiIdSchema.optional(),
})
export type AdminEmployeeOptionsQuery = z.infer<typeof adminEmployeeOptionsQuerySchema>

/** 管理端角色摘要（含成员数与权限码） */
export const adminRoleSummarySchema = z.object({
  code: roleCodeSchema,
  name: z.string().min(1).max(64),
  description: z.string().max(255),
  memberCount: z.number().int().nonnegative(),
  permissions: z.array(permissionCodeSchema),
})
export type AdminRoleSummary = z.infer<typeof adminRoleSummarySchema>

/** 权限目录项 */
export const permissionSummarySchema = z.object({
  code: permissionCodeSchema,
  description: z.string().max(255),
})
export type PermissionSummary = z.infer<typeof permissionSummarySchema>

export const adminRolesQuerySchema = z.strictObject({
  companyId: apiIdSchema.optional(),
})
export type AdminRolesQuery = z.infer<typeof adminRolesQuerySchema>

export const adminRolesResultSchema = z.object({
  roles: z.array(adminRoleSummarySchema),
  permissions: z.array(permissionSummarySchema),
})
export type AdminRolesResult = z.infer<typeof adminRolesResultSchema>

export const adminEmployeeDeleteResultSchema = z.object({
  ok: z.boolean(),
})
export type AdminEmployeeDeleteResult = z.infer<typeof adminEmployeeDeleteResultSchema>
