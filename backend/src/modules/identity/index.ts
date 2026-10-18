/** identity 模块唯一公共入口：跨模块只能经由本文件引用 */
export { createAuthMiddleware, requireAuthContext } from './auth-middleware.js'
export { createAuthRouter } from './router.js'
export { createIdentityRouter } from './identity-router.js'
export { createAdminRouter } from './admin-router.js'
export { createIdentityService } from './service.js'
export { createMySqlIdentityRepository } from './repository.js'
export { createCachedIdentityRepository } from './cached-repository.js'
export { createTokenService } from './token.js'
export {
  createMemorySessionStore,
  createRedisSessionStore,
} from './session-store.js'
export { createBcryptPasswordVerifier, hashPassword } from './password.js'
export {
  createRequireAnyPermission,
  createRequireCrossTenantAccess,
  createRequirePermission,
  hasCrossTenantAccess,
  hasPermission,
} from './policies.js'
export { PLATFORM_COMPANY_CODE } from './constants.js'
export type {
  AuthContext,
  Authorization,
  IdentityRepository,
  IdentityService,
  PasswordHasher,
  PasswordVerifier,
  SessionStore,
  TokenIssuer,
  TokenVerifier,
} from './types.js'
