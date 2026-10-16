/**
 * 审批状态（Pinia）。
 * 视角划分：待我审批（当前节点是我）/ 我发起的 / 已处理（我审批过的他人事项）。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { workflowsApi } from './api'
import type { ApprovalItem, CreateApprovalPayload, DecisionPayload } from './types'

export const useWorkflowsStore = defineStore('workflows', () => {
  const approvals = ref<ApprovalItem[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  const myId = computed(() => useAuthStore().user?.id ?? '')

  const pendingApprovals = computed(() =>
    approvals.value.filter(
      (item) => item.status === 'pending' && item.currentApproverId === myId.value,
    ),
  )

  const myApprovals = computed(() =>
    approvals.value.filter((item) => item.applicant.id === myId.value),
  )

  /** 我处理过（通过/驳回）的他人事项；提交节点不计入 */
  const processedApprovals = computed(() => {
    const mineIds = new Set(myApprovals.value.map((item) => item.id))
    return approvals.value.filter(
      (item) =>
        !mineIds.has(item.id) &&
        item.steps.some(
          (step) =>
            step.nodeName !== '提交申请' &&
            step.approver?.id === myId.value &&
            (step.status === 'done' || step.status === 'rejected'),
        ),
    )
  })

  const pendingCount = computed(() => pendingApprovals.value.length)

  async function loadAll(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    try {
      approvals.value = await workflowsApi.list()
      loaded.value = true
    } catch (error) {
      console.error('[workflows] 审批列表加载失败', error)
    } finally {
      loading.value = false
    }
  }

  async function create(payload: CreateApprovalPayload): Promise<ApprovalItem> {
    const item = await workflowsApi.create(payload)
    approvals.value.unshift(item)
    return item
  }

  async function decide(id: string, payload: DecisionPayload): Promise<void> {
    const updated = await workflowsApi.decide(id, payload)
    const index = approvals.value.findIndex((item) => item.id === id)
    if (index !== -1) approvals.value[index] = updated
  }

  function byId(id: string): ApprovalItem | undefined {
    return approvals.value.find((item) => item.id === id)
  }

  return {
    approvals,
    loaded,
    loading,
    pendingApprovals,
    myApprovals,
    processedApprovals,
    pendingCount,
    loadAll,
    create,
    decide,
    byId,
  }
})
