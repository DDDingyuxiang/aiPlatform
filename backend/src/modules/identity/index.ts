/** identity 模块唯一公共入口：跨模块只能经由本文件引用 */
export { createAuthMiddleware } from './auth-middleware.js'
export { createAuthRouter } from './router.js'
export { createIdentityRouter } from './identity-router.js'
export { createAdminRouter } from './admin-router.js'
export { createIdentityService } from './service.js'
export { createMySqlIdentityRepository } from './repository.js'
export { createTokenService } from './token.js'
export { createBcryptPasswordVerifier, hashPassword } from './password.js'
export {
  createRequireAnyPermission,
  createRequirePermission,
  hasPermission,
} from './policies.js'
export { PLATFORM_COMPANY_CODE } from './constants.js'
export type {
  AuthContext,
  IdentityRepository,
  IdentityService,
  PasswordHasher,
  PasswordVerifier,
  TokenIssuer,
  TokenVerifier,
} from './types.js'
