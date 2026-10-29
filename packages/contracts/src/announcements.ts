import { z } from 'zod'

export const announcementScopeSchema = z.enum(['company', 'department', 'colleague'])

export const createAnnouncementPayloadSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(255),
    paragraphs: z.array(z.string().trim().min(1).max(4_000)).min(1).max(30),
    scope: announcementScopeSchema,
    department: z.string().trim().min(1).max(255).optional(),
    pinned: z.boolean().optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.scope === 'department' && !payload.department) {
      ctx.addIssue({
        code: 'custom',
        path: ['department'],
        message: '部门公告必须指定部门',
      })
    }
    if (payload.scope !== 'department' && payload.department !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['department'],
        message: '仅部门公告可以指定部门',
      })
    }
  })

export type CreateAnnouncementPayload = z.infer<typeof createAnnouncementPayloadSchema>
