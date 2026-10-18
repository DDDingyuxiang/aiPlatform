/**
 * aiPlatform 前后端共享契约入口。
 *
 * 使用方式：
 * - Express + TypeScript 后端：使用导出的 Zod schema 校验请求/响应；
 * - Vue 前端：使用导出的 TypeScript 类型；
 * - 数据库字段变更时，必须同步本契约与 scripts/database 下的 SQL。
 */
export * from './common.js'
export * from './permissions.js'
export * from './identity.js'
export * from './auth.js'
export * from './admin.js'
export * from './attendance.js'
export * from './ai.js'
export * from './conversations.js'
export * from './tasks.js'
export * from './workflows.js'
