/**
 * 公告接口的 Mock 实现（演示数据，后端 announcements 模块就绪后整体删除）。
 * 可见范围按当前用户过滤；已读状态为模块级可变状态（会话内保留）。
 */
import { defineMock, fail } from '@/core/http'
import { findMockUserId } from '@/core/auth/mock'
import { MEMBERS } from '@/modules/identity'
import { DEMO_ANNOUNCEMENTS } from './data'
import type { Announcement } from './types'

const announcements: Announcement[] = DEMO_ANNOUNCEMENTS.map((item) => ({ ...item }))

function myDepartment(userId: string | null): string {
  return MEMBERS.find((member) => member.id === userId)?.department ?? ''
}

/** 当前用户可见的公告：公司 / 本部门 / 同事 */
function visibleFor(userId: string | null): Announcement[] {
  const department = myDepartment(userId)
  return announcements.filter((item) => {
    if (item.scope === 'department') return item.department === department
    return true
  })
}

defineMock(
  'GET',
  '/announcements',
  ({ token }) => {
    const userId = findMockUserId(token)
    if (!userId) return fail(40100, '登录状态已失效', 401)
    return visibleFor(userId)
      .map((item) => ({ ...item, attachments: [...item.attachments] }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  },
  { delayMs: 250 },
)

defineMock('PATCH', '/announcements/:id/read', ({ params, token }) => {
  const userId = findMockUserId(token)
  if (!userId) return fail(40100, '登录状态已失效', 401)
  const item = visibleFor(userId).find((announcement) => announcement.id === params.id)
  if (!item) return fail(40420, '公告不存在', 404)
  item.read = true
  return { ok: true }
})

defineMock('POST', '/announcements/read-all', ({ token }) => {
  const userId = findMockUserId(token)
  if (!userId) return fail(40100, '登录状态已失效', 401)
  for (const item of visibleFor(userId)) item.read = true
  return { ok: true }
})
