/** announcements 模块公开导出：跨模块仅可经由本文件引用 */
export { useAnnouncementsStore } from './store'
export { default as AnnouncementsView } from './AnnouncementsView.vue'
export { default as AnnouncementSection } from './components/AnnouncementSection.vue'
export { default as AnnouncementDetailModal } from './components/AnnouncementDetailModal.vue'
export type { Announcement, AnnouncementAttachment, AnnouncementScope } from './types'
