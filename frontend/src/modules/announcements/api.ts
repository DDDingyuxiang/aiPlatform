/** 公告接口（经统一 HTTP 客户端，开发环境由 mock.ts 拦截） */
import { http } from '@/core/http'
import type { Announcement } from './types'

export const announcementsApi = {
  list: () => http.get<Announcement[]>('/announcements'),
  markRead: (id: string) => http.patch<{ ok: boolean }>(`/announcements/${id}/read`),
  markAllRead: () => http.post<{ ok: boolean }>('/announcements/read-all'),
}
