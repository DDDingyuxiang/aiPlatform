/**
 * 访问令牌的本地存取与响应式状态（低层模块，不依赖 store 与 HTTP 客户端，避免循环依赖）。
 *
 * - 令牌同时保存在 reactive ref（供登录态 computed 追踪）与 Web Storage；
 *   登录、登出、401 清理都必须通过本模块的函数修改，保证 UI 状态与存储一致；
 * - 勾选「记住我」时存 localStorage（跨会话有效），否则存 sessionStorage（关闭标签页即失效）；
 * - 生产环境下令牌由后端签发，前端只负责保存与携带。
 *
 * 安全评估（2026-10-16，原型阶段结论）：
 * Web Storage 方案实现简单，但页面一旦存在 XSS，令牌可被恶意脚本读取。
 * 面向真实企业用户时，应结合后端认证方案评估改为由后端通过 HttpOnly + Secure +
 * 适当 SameSite 属性的 Cookie 管理会话，并配套 CSRF 防护；届时本模块与 core/http
 * 的令牌携带逻辑需同步调整。是否切换由后端认证方案决定，原型阶段不做重写。
 */
import { ref } from 'vue'

const TOKEN_KEY = 'app.auth.token'

const token = ref<string | null>(
  localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY),
)

export function getToken(): string | null {
  return token.value
}

export function setToken(value: string, persist: boolean): void {
  clearToken()
  token.value = value
  if (persist) localStorage.setItem(TOKEN_KEY, value)
  else sessionStorage.setItem(TOKEN_KEY, value)
}

export function clearToken(): void {
  token.value = null
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
}
