/** 认证接口（经统一 HTTP 客户端，开发环境由 mock.ts 拦截） */
import { http } from '@/core/http'
import type { LoginPayload, LoginResult, ProfileUpdate, UserProfile } from './types'

export const authApi = {
  login: (payload: LoginPayload) => http.post<LoginResult>('/auth/login', payload),
  logout: () => http.post<{ ok: boolean }>('/auth/logout'),
  profile: () => http.get<UserProfile>('/auth/profile'),
  updateProfile: (payload: ProfileUpdate) => http.patch<UserProfile>('/auth/profile', payload),
}
