import { describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '../../../http/errors.js'
import { createMemoryRealtimeBus, userTopic } from '../../../infra/realtime.js'
import { createConversationsService } from '../service.js'
import { createMemoryUnreadStore } from '../unread-store.js'
import type {
  AttachmentRecord,
  AttachmentStorage,
  ConversationRecord,
  ConversationsRepository,
  EmployeeRefRecord,
  MessageRecord,
} from '../types.js'

const auth = { tenantId: '1', employeeId: '2', publicId: 'p-self' }

const member: EmployeeRefRecord = {
  employeeId: '3',
  publicId: 'p-member',
  name: '李思',
  status: 'active',
}

const directConversation: ConversationRecord = {
  conversationId: '10',
  publicId: 'c-1',
  type: 'direct',
  title: null,
  participants: [
    { employeeId: '2', publicId: 'p-self', name: '我' },
    { employeeId: '3', publicId: 'p-member', name: '李思' },
  ],
  lastMessage: '',
  updatedAt: '2026-10-18T00:00:00.000Z',
}

const textMessage: MessageRecord = {
  id: '1',
  conversationId: '10',
  conversationPublicId: 'c-1',
  senderPublicId: 'p-self',
  content: '你好',
  type: 'text',
  attachments: [],
  sentAt: '2026-10-18T00:00:00.000Z',
}

const attachment: AttachmentRecord = {
  id: '5',
  fileName: '需求说明.txt',
  mimeType: 'text/plain',
  sizeBytes: 12,
  storageKey: '1/c-1/key',
}

function setup(overrides: {
  members?: EmployeeRefRecord[]
  direct?: ConversationRecord | null
  conversation?: ConversationRecord | null
  messages?: MessageRecord[]
  createdMessage?: MessageRecord
  createMessageError?: Error
  attachment?: AttachmentRecord | null
}) {
  const repository: ConversationsRepository = {
    findEmployeesByPublicIds: vi.fn(async () => overrides.members ?? [member]),
    findDirectConversation: vi.fn(async () => overrides.direct ?? null),
    createConversation: vi.fn(async () => {}),
    listConversations: vi.fn(async () => [directConversation]),
    findConversationForMember: vi.fn(async () =>
      overrides.conversation === undefined ? directConversation : overrides.conversation,
    ),
    listMessages: vi.fn(async () => overrides.messages ?? [textMessage]),
    createMessage: vi.fn(async () => {
      if (overrides.createMessageError) throw overrides.createMessageError
      return overrides.createdMessage ?? textMessage
    }),
    findAttachmentForMember: vi.fn(async () =>
      overrides.attachment === undefined ? attachment : overrides.attachment,
    ),
  }

  const storage: AttachmentStorage = {
    save: vi.fn(async () => {}),
    open: vi.fn(async () => ({}) as never),
    remove: vi.fn(async () => {}),
  }

  const realtime = createMemoryRealtimeBus()
  const unread = createMemoryUnreadStore()
  const service = createConversationsService({
    repository,
    storage,
    realtime,
    unread,
    timezone: 'Asia/Shanghai',
    maxUploadBytes: 1024,
  })

  return { service, repository, storage, realtime, unread }
}

describe('conversations service', () => {
  it('创建两人私聊时把创建人一并写入成员，并复用已有会话', async () => {
    const fresh = setup({})
    const created = await fresh.service.create(auth, { memberIds: ['p-member'] })

    expect(fresh.repository.createConversation).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        type: 'direct',
        title: null,
        createdBy: '2',
        memberIds: ['2', '3'],
      }),
    )
    expect(created).toMatchObject({
      id: 'c-1',
      type: 'direct',
      name: '李思',
      unread: 0,
    })
    expect(created.participants.map((participant) => participant.id)).toEqual([
      'p-self',
      'p-member',
    ])

    const existing = setup({ direct: directConversation })
    await existing.service.create(auth, { memberIds: ['p-member'] })
    expect(existing.repository.createConversation).not.toHaveBeenCalled()
  })

  it('拒绝空成员、外部成员与停用成员', async () => {
    const selfOnly = setup({})
    await expect(
      selfOnly.service.create(auth, { memberIds: ['p-self'] }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_PAYLOAD })

    const missing = setup({ members: [] })
    await expect(
      missing.service.create(auth, { memberIds: ['p-member'] }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_PAYLOAD })

    const disabled = setup({ members: [{ ...member, status: 'disabled' }] })
    await expect(
      disabled.service.create(auth, { memberIds: ['p-member'] }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_PAYLOAD })
  })

  it('群聊按参与者姓名自动命名', async () => {
    const { service, repository } = setup({
      members: [
        member,
        { employeeId: '4', publicId: 'p-2', name: '赵强', status: 'active' },
        { employeeId: '5', publicId: 'p-3', name: '陈晨', status: 'active' },
      ],
    })

    await service.create(auth, { memberIds: ['p-member', 'p-2', 'p-3'] })

    expect(repository.createConversation).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ type: 'group', title: '李思、赵强等 3 人群聊' }),
    )
  })

  it('只有会话成员可以读取消息与下载附件', async () => {
    const outsider = setup({ conversation: null })
    await expect(outsider.service.listMessages(auth, 'c-1')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    })
    await expect(
      outsider.service.sendMessage(auth, 'c-1', { content: 'hi' }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })

    const allowed = setup({})
    await expect(allowed.service.listMessages(auth, 'c-1')).resolves.toEqual([
      {
        id: '1',
        conversationId: 'c-1',
        senderId: 'p-self',
        content: '你好',
        type: 'text',
        attachments: [],
        sentAt: '2026-10-18T00:00:00.000Z',
      },
    ])

    const attachmentOutsider = setup({ attachment: null })
    await expect(
      attachmentOutsider.service.getAttachment(auth, 'c-1', '5'),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
  })

  it('发送附件时写入存储与消息附件元数据', async () => {
    const fileMessage: MessageRecord = {
      ...textMessage,
      type: 'file',
      content: '请查收',
      attachments: [attachment],
    }
    const { service, repository, storage } = setup({ createdMessage: fileMessage })

    const result = await service.sendAttachment(auth, 'c-1', {
      fileName: '需求说明.txt',
      mimeType: 'text/plain; charset=utf-8',
      data: Buffer.from('hello'),
      caption: ' 请查收 ',
    })

    expect(storage.save).toHaveBeenCalledWith(
      expect.stringMatching(/^1\/c-1\//),
      Buffer.from('hello'),
    )
    expect(repository.createMessage).toHaveBeenCalledWith(
      '1',
      directConversation,
      '2',
      expect.objectContaining({
        type: 'file',
        content: '请查收',
        attachment: expect.objectContaining({
          fileName: '需求说明.txt',
          mimeType: 'text/plain',
          sizeBytes: 5,
        }),
      }),
    )
    expect(result.attachments[0]).toMatchObject({
      id: '5',
      fileName: '需求说明.txt',
    })
  })

  it('数据库写入失败时清理已保存的附件', async () => {
    const { service, storage } = setup({
      createMessageError: new Error('db down'),
    })

    await expect(
      service.sendAttachment(auth, 'c-1', {
        fileName: 'a.txt',
        mimeType: 'text/plain',
        data: Buffer.from('x'),
      }),
    ).rejects.toThrow('db down')

    expect(storage.remove).toHaveBeenCalledWith(expect.stringMatching(/^1\/c-1\//))
  })

  it('消息落库后推送实时事件，并为接收方累加未读', async () => {
    const { service, realtime, unread } = setup({})
    const events: Array<{ type: string; payload: unknown }> = []
    const offRecipient = await realtime.subscribe(userTopic('1', '3'), (event) =>
      events.push(event),
    )
    const offSender = await realtime.subscribe(userTopic('1', '2'), (event) =>
      events.push(event),
    )

    await service.sendMessage(auth, 'c-1', { content: '你好' })
    await offRecipient()
    await offSender()

    expect(
      events.filter((event) => event.type === 'chat.message').length,
    ).toBeGreaterThanOrEqual(2)
    expect(events.some((event) => event.type === 'notification')).toBe(true)
    await expect(unread.get('1', '3', 'c-1')).resolves.toBe(1)
    await expect(unread.get('1', '2', 'c-1')).resolves.toBe(0)
  })

  it('会话列表返回未读数，打开会话后清零', async () => {
    const { service, unread } = setup({})
    await unread.increment('1', '2', 'c-1')
    await unread.increment('1', '2', 'c-1')

    const conversations = await service.list(auth)
    expect(conversations[0]?.unread).toBe(2)

    await expect(service.markRead(auth, 'c-1')).resolves.toEqual({ ok: true })
    await expect(unread.get('1', '2', 'c-1')).resolves.toBe(0)
  })

  it('附件下载返回文件流与元数据', async () => {
    const { service, repository, storage } = setup({})

    const result = await service.getAttachment(auth, 'c-1', '5')

    expect(repository.findAttachmentForMember).toHaveBeenCalledWith('1', 'c-1', '5', '2')
    expect(storage.open).toHaveBeenCalledWith('1/c-1/key')
    expect(result).toMatchObject({
      fileName: '需求说明.txt',
      mimeType: 'text/plain',
      sizeBytes: 12,
    })
  })
})
