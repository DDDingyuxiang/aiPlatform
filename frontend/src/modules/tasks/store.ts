/**
 * 任务状态（Pinia）。
 * 视角划分：我负责的（assignee = 我）/ 我分配的（creator = 我且负责人不是我）。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { tasksApi } from './api'
import {
  displayStatus,
  type CreateTaskPayload,
  type Milestone,
  type TaskItem,
  type UpdateTaskPayload,
} from './types'

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<TaskItem[]>([])
  const milestones = ref<Milestone[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  const myId = computed(() => useAuthStore().user?.id ?? '')

  const mineTasks = computed(() => tasks.value.filter((task) => task.assignee.id === myId.value))
  const assignedTasks = computed(() =>
    tasks.value.filter((task) => task.creator.id === myId.value && task.assignee.id !== myId.value),
  )

  /** 面板「任务」区块展示：我负责的未完成事项，按截止时间升序 */
  const myPendingTasks = computed(() =>
    mineTasks.value
      .filter((task) => task.status !== 'done')
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
  )

  const pendingCount = computed(() => myPendingTasks.value.length)

  async function loadAll(force = false): Promise<void> {
    if ((loaded.value && !force) || loading.value) return
    loading.value = true
    try {
      const [taskList, milestoneList] = await Promise.all([tasksApi.list(), tasksApi.milestones()])
      tasks.value = taskList
      milestones.value = milestoneList
      loaded.value = true
    } catch (error) {
      console.error('[tasks] 任务加载失败', error)
    } finally {
      loading.value = false
    }
  }

  /** AI 创建任务等场景下强制刷新 */
  async function refresh(): Promise<void> {
    await loadAll(true)
  }

  async function create(payload: CreateTaskPayload): Promise<TaskItem> {
    const task = await tasksApi.create(payload)
    tasks.value.push(task)
    return task
  }

  async function update(id: string, payload: UpdateTaskPayload): Promise<TaskItem> {
    const updated = await tasksApi.update(id, payload)
    const index = tasks.value.findIndex((task) => task.id === id)
    if (index !== -1) tasks.value[index] = updated
    return updated
  }

  async function setStatus(id: string, status: TaskItem['status']): Promise<void> {
    await update(id, { status })
  }

  function taskById(id: string): TaskItem | undefined {
    return tasks.value.find((task) => task.id === id)
  }

  return {
    tasks,
    milestones,
    loaded,
    loading,
    mineTasks,
    assignedTasks,
    myPendingTasks,
    pendingCount,
    loadAll,
    refresh,
    create,
    update,
    setStatus,
    taskById,
    displayStatus,
  }
})
