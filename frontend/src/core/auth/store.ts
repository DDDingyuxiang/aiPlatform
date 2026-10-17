/**
 * 认证状态（Pinia）。
 *
 * 安全说明：前端的登录态与角色只用于界面展示与路由引导；
 * 真正的权限校验由后端强制执行（见 说明.md · 安全规范）。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from './api'
import { clearToken, getToken, setToken } from './token'
import type { LoginPayload, ProfileUpdate, RoleCode, UserProfile } from './types'

const USER_CACHE_KEY = 'app.auth.user'

function readCachedUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY)
    return raw ? (JSON.parse(raw) as UserProfile) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserProfile | null>(readCachedUser())
  const loggingIn = ref(false)

  // 注意：两个条件都必须先求值再合并，不能写成 `!!getToken() && !!user.value`——
  // 首次评估时令牌为空会导致短路，user 依赖未被追踪，computed 将永久缓存
  // 首次结果（登录成功后仍判定为未登录，引发登录无法跳转）。
  const isAuthenticated = computed(() => {
    const hasToken = !!getToken()
    const hasUser = !!user.value
    return hasToken && hasUser
  })

  function cacheUser(profile: UserProfile | null): void {
    if (profile) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(profile))
    else localStorage.removeItem(USER_CACHE_KEY)
  }

  async function login(payload: LoginPayload): Promise<void> {
    loggingIn.value = true
    try {
      const result = await authApi.login(payload)
      setToken(result.token, payload.remember)
      user.value = result.user
      cacheUser(result.user)
    } finally {
      loggingIn.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch {
      // 退出接口失败不阻塞本地登出
    }
    clearToken()
    user.value = null
    cacheUser(null)
  }

  /** 刷新页面后用令牌校验并同步最新资料 */
  async function refreshProfile(): Promise<void> {
    if (!getToken()) {
      user.value = null
      cacheUser(null)
      return
    }
    try {
      const profile = await authApi.profile()
      user.value = profile
      cacheUser(profile)
    } catch {
      clearToken()
      user.value = null
      cacheUser(null)
    }
  }

  /** 修改个人资料并同步本地缓存（用于头部、个人卡片等全局展示） */
  async function updateProfile(payload: ProfileUpdate): Promise<UserProfile> {
    const profile = await authApi.updateProfile(payload)
    user.value = profile
    cacheUser(profile)
    return profile
  }

  function hasRole(role: RoleCode): boolean {
    return user.value?.role === role
  }

  return {
    user,
    loggingIn,
    isAuthenticated,
    login,
    logout,
    refreshProfile,
    updateProfile,
    hasRole,
  }
})
