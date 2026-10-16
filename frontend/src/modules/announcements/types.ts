/** 公告类型（与后端 announcements 模块的契约保持一致） */

export type AnnouncementScope = 'company' | 'department' | 'colleague'

export interface AnnouncementAttachment {
  id: string
  name: string
  sizeBytes: number
}

export interface Announcement {
  id: string
  title: string
  /** 正文段落（空行分段由后端输出） */
  paragraphs: string[]
  scope: AnnouncementScope
  /** scope=department 时的可见部门 */
  department?: string
  publisher: { id: string; name: string }
  /** ISO 8601 */
  publishedAt: string
  read: boolean
  pinned?: boolean
  attachments: AnnouncementAttachment[]
}
