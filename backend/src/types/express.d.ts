import type { AuthContext } from '../modules/identity/types.js'

declare global {
  namespace Express {
    interface Request {
      /** 由 requestIdMiddleware 注入 */
      requestId: string
      /** 由认证中间件注入；公开接口为空 */
      auth?: AuthContext
    }
  }
}

export {}
