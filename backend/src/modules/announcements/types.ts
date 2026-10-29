import type { AuthContext } from '../identity/index.js'

export interface AnnouncementItem {
  id: string
  title: string
  paragraphs: string[]
  scope: 'company' | 'department' | 'colleague'
  department?: string
  publisher: { id: string; name: string }
  publishedAt: string
  read: boolean
  pinned: boolean
  attachments: Array<{ id: string; name: string; sizeBytes: number }>
}

export interface AnnouncementsRepository {
  list(auth: AuthContext): Promise<AnnouncementItem[]>
  markRead(auth: AuthContext, publicId: string): Promise<boolean>
  markAllRead(auth: AuthContext): Promise<void>
}

export interface AnnouncementsService {
  list(auth: AuthContext): Promise<AnnouncementItem[]>
  markRead(auth: AuthContext, publicId: string): Promise<void>
  markAllRead(auth: AuthContext): Promise<void>
}
