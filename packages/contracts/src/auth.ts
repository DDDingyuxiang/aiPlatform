/**
 * 认证契约。
 *
 * UserProfile 必须与首页个人卡片展示字段保持一致；
 * 后端登录接口应返回该结构，敏感字段（密码哈希等）不得出现在契约中。
 */
import { z } from 'zod'
import { memberSchema, permissionCodeSchema, systemRoleCodeSchema } from './identity.js'

/** 当前登录用户资料（首页个人卡片） */
export const userProfileSchema = memberSchema
  .omit({ departmentId: true })
  .extend({
    username: z.string().min(1).max(64),
    role: systemRoleCodeSchema,
    /** 角色授予的权限码；system.super_admin 视为全量权限 */
    permissions: z.array(permissionCodeSchema),
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

/**
 * 当前用户可自行修改的个人资料。
 * 用户名、工号、部门和角色不允许自助修改，由管理员维护。
 */
export const profileUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(128).optional(),
    position: z.string().trim().max(128).nullable().optional(),
    email: z.email().max(255).optional(),
    phone: z.string().trim().max(32).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: '至少提交一个需要修改的字段',
  })
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>
