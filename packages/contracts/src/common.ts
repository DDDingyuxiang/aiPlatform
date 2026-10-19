/**
 * 通用 API 契约：所有模块共享的响应信封、ID、时间与分页约定。
 *
 * 约定：
 * - API 字段统一使用 camelCase，数据库字段使用 snake_case；
 * - 对外 ID 统一为字符串，不向前端暴露自增数值的类型细节；
 * - 时间统一为带时区的 ISO 8601 字符串（UTC）；
 * - 日期为 YYYY-MM-DD，月份为 YYYY-MM。
 */
import { z } from 'zod'

/** 统一成功码；非 0 为稳定业务错误码 */
export const SUCCESS_CODE = 0

/** 统一响应信封（与前端 core/http/types.ts 保持一致） */
export interface ApiEnvelope<T> {
  code: number
  data: T
  message: string
  requestId: string
  /** 可选的结构化错误详情（例如知识库同名冲突候选） */
  details?: unknown
}

/** 对外资源 ID（字符串形式） */
export const apiIdSchema = z.string().min(1).max(64)

/** 带时区的 ISO 8601 时间字符串 */
export const isoDateTimeSchema = z.iso.datetime({ offset: true })

/** 日期字符串 YYYY-MM-DD */
export const isoDateSchema = z.iso.date()

/** 月份字符串 YYYY-MM */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, '月份格式必须为 YYYY-MM')

/** 分页查询参数（Express 查询串为字符串，因此使用 coerce） */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

/** 分页响应结构 */
export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
