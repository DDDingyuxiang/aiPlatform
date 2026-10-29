/**
 * 公告状态（Pinia）。
 * 已读状态：本地先更新（乐观），接口失败时回滚。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { announcementsApi } from './api'
import type { Announcement, AnnouncementScope } from './types'
import type { CreateAnnouncementPayload } from '@aiplatform/contracts'

export const useAnnouncementsStore = defineStore('announcements', () => {
  const items = ref<Announcement[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  /** 排序：置顶优先，其次按发布时间倒序 */
  const sortedItems = computed(() =>
    [...items.value].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      return b.publishedAt.localeCompare(a.publishedAt)
    }),
  )

  const unreadCount = computed(() => items.value.filter((item) => !item.read).length)

  /** 面板预览：最近 3 条 */
  const recentItems = computed(() => sortedItems.value.slice(0, 3))

  function byScope(scope: AnnouncementScope | 'all'): Announcement[] {
    if (scope === 'all') return sortedItems.value
    return sortedItems.value.filter((item) => item.scope === scope)
  }

  async function loadAll(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    try {
      items.value = await announcementsApi.list()
      loaded.value = true
    } catch (error) {
      console.error('[announcements] 公告加载失败', error)
    } finally {
      loading.value = false
    }
  }

  async function markRead(id: string): Promise<void> {
    const item = items.value.find((announcement) => announcement.id === id)
    if (!item || item.read) return
    item.read = true
    try {
      await announcementsApi.markRead(id)
    } catch (error) {
      item.read = false
      console.error('[announcements] 标记已读失败', error)
    }
  }

  async function markAllRead(): Promise<void> {
    const unread = items.value.filter((item) => !item.read)
    if (unread.length === 0) return
    for (const item of unread) item.read = true
    try {
      await announcementsApi.markAllRead()
    } catch (error) {
      for (const item of unread) item.read = false
      console.error('[announcements] 全部已读失败', error)
    }
  }

  async function create(payload: CreateAnnouncementPayload): Promise<void> {
    await announcementsApi.create(payload)
    loaded.value = false
    await loadAll()
  }

  function byId(id: string): Announcement | undefined {
    return items.value.find((announcement) => announcement.id === id)
  }

  return {
    items,
    loaded,
    sortedItems,
    recentItems,
    unreadCount,
    byScope,
    loadAll,
    markRead,
    markAllRead,
    create,
    byId,
  }
})
