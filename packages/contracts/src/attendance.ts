/**
 * 考勤契约。
 *
 * - 首页月度考勤使用 AttendanceResult（month + days）；
 * - 考勤 CRUD 使用 AttendanceRecord；
 * - employeeId 为员工对外 public_id，不是数据库自增 ID。
 */
import { z } from 'zod'
import { apiIdSchema, isoDateSchema, isoDateTimeSchema, monthSchema, paginationQuerySchema } from './common.js'

export const attendanceStatusSchema = z.enum(['normal', 'late', 'absent'])
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>

export const attendanceSourceSchema = z.enum(['system', 'device', 'manual', 'import'])
export type AttendanceSource = z.infer<typeof attendanceSourceSchema>

/** 首页考勤日历中的一天 */
export const attendanceDaySchema = z.object({
  date: isoDateSchema,
  status: attendanceStatusSchema,
})
export type AttendanceDay = z.infer<typeof attendanceDaySchema>

/** 首页“本月考勤”响应 */
export const attendanceResultSchema = z.object({
  month: monthSchema,
  days: z.array(attendanceDaySchema),
})
export type AttendanceResult = z.infer<typeof attendanceResultSchema>

/** 考勤记录（CRUD） */
export const attendanceRecordSchema = z.object({
  id: apiIdSchema,
  employeeId: apiIdSchema,
  workDate: isoDateSchema,
  status: attendanceStatusSchema,
  checkInAt: isoDateTimeSchema.nullable(),
  checkOutAt: isoDateTimeSchema.nullable(),
  source: attendanceSourceSchema,
  remark: z.string().max(255).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>

/** 新建考勤记录 */
export const attendanceCreateSchema = z.strictObject({
  employeeId: apiIdSchema,
  workDate: isoDateSchema,
  status: attendanceStatusSchema,
  checkInAt: isoDateTimeSchema.nullable().optional(),
  checkOutAt: isoDateTimeSchema.nullable().optional(),
  source: attendanceSourceSchema.default('manual'),
  remark: z.string().trim().max(255).nullable().optional(),
})
export type AttendanceCreate = z.infer<typeof attendanceCreateSchema>

/** 更新考勤记录（不允许修改员工与日期，避免唯一键冲突歧义） */
export const attendanceUpdateSchema = z.strictObject({
  status: attendanceStatusSchema.optional(),
  checkInAt: isoDateTimeSchema.nullable().optional(),
  checkOutAt: isoDateTimeSchema.nullable().optional(),
  source: attendanceSourceSchema.optional(),
  remark: z.string().trim().max(255).nullable().optional(),
})
export type AttendanceUpdate = z.infer<typeof attendanceUpdateSchema>

/** 考勤列表查询（分页） */
export const attendanceQuerySchema = paginationQuerySchema.extend({
  employeeId: apiIdSchema.optional(),
  month: monthSchema.optional(),
  status: attendanceStatusSchema.optional(),
})
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>

/** 首页月度考勤查询 */
export const attendanceMonthlyQuerySchema = z.object({
  employeeId: apiIdSchema,
  month: monthSchema,
})
export type AttendanceMonthlyQuery = z.infer<typeof attendanceMonthlyQuerySchema>
