import { describe, expect, it, vi } from 'vitest'
import type { TaskItem } from '@aiplatform/contracts'
import { createTasksService } from '../service.js'
import { hasFutureTimeExpression } from '../time-expression.js'
import type {
  AiTaskAnalyzer,
  ChatTaskAnalysisInput,
  TaskCreateRecord,
  TaskRecord,
  TasksRepository,
} from '../types.js'

const auth = { tenantId: '1', employeeId: '2', publicId: 'p-1' }
const other = { employeeId: '3', publicId: 'p-2', name: '王真' }

const taskRecord: TaskRecord = {
  taskId: '10',
  publicId: '01JTASK000000000000000001',
  title: '提交方案',
  description: '把方案发给同事',
  status: 'todo',
  priority: 'high',
  dueAt: '2026-10-19T07:00:00.000Z',
  progress: 0,
  assignee: { employeeId: other.employeeId, publicId: other.publicId, name: other.name },
  creator: { employeeId: auth.employeeId, publicId: auth.publicId, name: '管理员' },
}

const analysisInput: ChatTaskAnalysisInput = {
  auth,
  conversation: {
    conversationId: '20',
    publicId: 'c-1',
    type: 'direct',
    title: null,
    participants: [
      { employeeId: '2', publicId: 'p-1', name: '管理员' },
      { employeeId: '3', publicId: 'p-2', name: '王真' },
    ],
  },
  message: {
    id: '99',
    senderPublicId: 'p-1',
    content: '明天下午3点前把方案发给我',
    sentAt: '2026-10-18T02:00:00.000Z',
  },
  recentMessages: [
    {
      senderId: 'p-1',
      senderName: '管理员',
      content: '明天下午3点前把方案发给我',
      sentAt: '2026-10-18T02:00:00.000Z',
    },
  ],
  timezone: 'Asia/Shanghai',
}

function setup(overrides?: {
  extracted?: Awaited<ReturnType<AiTaskAnalyzer['extract']>>
  existing?: TaskRecord | null
}) {
  let created = false
  const repository: TasksRepository = {
    listForEmployee: vi.fn(async () => [taskRecord]),
    findForEmployee: vi.fn(async (_tenantId, publicId) =>
      created || publicId === taskRecord.publicId ? taskRecord : null,
    ),
    findBySourceMessage: vi.fn(async () =>
      overrides?.existing !== undefined
        ? overrides.existing
        : created
          ? taskRecord
          : null,
    ),
    create: vi.fn(async (_tenantId: string, _record: TaskCreateRecord) => {
      created = true
    }),
    updateStatus: vi.fn(async () => {}),
    findEmployeesByPublicIds: vi.fn(async () => [
      { employeeId: '3', publicId: 'p-2', name: '王真', status: 'active' },
    ]),
  }

  const analyzer: AiTaskAnalyzer = {
    extract: vi.fn(async () =>
      overrides?.extracted === undefined
        ? {
            create: true,
            title: '提交方案',
            description: '把方案发给同事',
            dueAt: '2026-10-19T15:00:00+08:00',
            priority: 'high' as const,
            assigneeId: 'p-2',
          }
        : overrides.extracted,
    ),
  }

  const service = createTasksService({
    repository,
    analyzer,
    timezone: 'Asia/Shanghai',
    now: () => new Date('2026-10-18T00:00:00.000Z'),
  })

  return { service, repository, analyzer }
}

describe('tasks service', () => {
  it('手工创建任务：校验负责人，并按业务时区 18:00 计算截止时间', async () => {
    const { service, repository } = setup()

    const result = await service.create(auth, {
      title: '提交方案',
      description: '把方案发给同事',
      priority: 'high',
      dueAt: '2026-10-19',
      assigneeId: 'p-2',
    })

    expect(result.id).toBe(taskRecord.publicId)
    expect(repository.create).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        assigneeEmployeeId: '3',
        creatorEmployeeId: '2',
        dueAt: new Date('2026-10-19T10:00:00.000Z'),
      }),
    )
  })

  it('列表与状态更新使用前端契约状态', async () => {
    const { service, repository } = setup()
    const items = await service.list(auth)
    expect(items[0]).toMatchObject({
      status: 'todo',
      assignee: { id: 'p-2', name: '王真' },
    })

    await service.updateStatus(auth, taskRecord.publicId, { status: 'inProgress' })
    expect(repository.updateStatus).toHaveBeenCalledWith('1', '10', 'in_progress')
    await expect(service.milestones(auth)).resolves.toEqual([])
  })

  it('AI 抽取结果创建任务，使用参与者作为负责人并记录来源消息', async () => {
    const { service, repository } = setup()

    const result = await service.analyzeChatMessage(analysisInput)

    expect(result).toMatchObject({
      assigneeEmployeeId: '3',
      creatorEmployeeId: '2',
      assigneeName: '王真',
      task: { title: '提交方案', status: 'todo', priority: 'high' },
    })
    expect(repository.create).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        sourceType: 'chat',
        sourceConversationId: '20',
        sourceMessageId: '99',
        assigneeEmployeeId: '3',
        creatorEmployeeId: '2',
      }),
    )
  })

  it('AI 判定无需创建、时间已过去或来源重复时不创建', async () => {
    const noTask = setup({ extracted: { create: false } })
    await expect(noTask.service.analyzeChatMessage(analysisInput)).resolves.toBeNull()

    const past = setup({
      extracted: {
        create: true,
        title: '过期任务',
        dueAt: '2026-10-17T15:00:00+08:00',
      },
    })
    await expect(past.service.analyzeChatMessage(analysisInput)).resolves.toBeNull()
    expect(past.repository.create).not.toHaveBeenCalled()

    const duplicate = setup({ existing: taskRecord })
    await expect(duplicate.service.analyzeChatMessage(analysisInput)).resolves.toBeNull()
    expect(duplicate.repository.create).not.toHaveBeenCalled()
  })

  it('AI 未给出有效负责人时回退到消息发送者', async () => {
    const { service } = setup({
      extracted: {
        create: true,
        title: '自己处理',
        dueAt: '2026-10-19T15:00:00+08:00',
        assigneeId: 'unknown',
      },
    })

    const result = await service.analyzeChatMessage(analysisInput)
    expect(result?.assigneeEmployeeId).toBe('2')
  })

  it('时间表达门闩只命中未来/日期类表述', () => {
    expect(hasFutureTimeExpression('明天下午3点前把方案发给我')).toBe(true)
    expect(hasFutureTimeExpression('五点开会')).toBe(true)
    expect(hasFutureTimeExpression('3号提交')).toBe(true)
    expect(hasFutureTimeExpression('这个月底前给出结论')).toBe(true)
    expect(hasFutureTimeExpression('下个星期五碰一下')).toBe(true)
    expect(hasFutureTimeExpression('昨天已经完成')).toBe(false)
    expect(hasFutureTimeExpression('整理月报')).toBe(false)
  })
})
