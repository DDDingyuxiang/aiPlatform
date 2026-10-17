/**
 * 认证契约。
 *
 * UserProfile 必须与首页个人卡片展示字段保持一致；
 * 后端登录接口应返回该结构，敏感字段（密码哈希等）不得出现在契约中。
 */
import { z } from 'zod'
import { memberSchema, systemRoleCodeSchema } from './identity.js'

/** 当前登录用户资料（首页个人卡片） */
export const userProfileSchema = memberSchema
  .omit({ departmentId: true })
  .extend({
    username: z.string().min(1).max(64),
    role: systemRoleCodeSchema,
  })
export type UserProfile = z.infer<typeof userProfileSchema>

/** 登录请求 */
export const loginPayloadSchema = z.strictObject({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  /** 记住我：令牌持久化到 localStorage */
  remember: z.boolean().default(false),
})
export type LoginPayload = z.infer<typeof loginPayloadSchema>

/** 登录响应 */
export const loginResultSchema = z.object({
  token: z.string().min(1),
  user: userProfileSchema,
})
export type LoginResult = z.infer<typeof loginResultSchema>
