/**
 * 组织与考勤状态（Pinia）。
 * 通讯录全局加载一次；考勤为当月数据，进入应用时加载一次。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { identityApi } from './api'
import type { AttendanceResult, Department, Member } from './types'

export const useIdentityStore = defineStore('identity', () => {
  const departments = ref<Department[]>([])
  const members = ref<Member[]>([])
  const attendance = ref<AttendanceResult | null>(null)
  const directoryLoaded = ref(false)
  const loadingDirectory = ref(false)

  async function loadDirectory(): Promise<void> {
    if (directoryLoaded.value || loadingDirectory.value) return
    loadingDirectory.value = true
    try {
      const result = await identityApi.directory()
      departments.value = result.departments
      members.value = result.members
      directoryLoaded.value = true
    } catch (error) {
      console.error('[identity] 通讯录加载失败', error)
    } finally {
      loadingDirectory.value = false
    }
  }

  async function loadAttendance(): Promise<void> {
    if (attendance.value) return
    try {
      attendance.value = await identityApi.attendance()
    } catch (error) {
      console.error('[identity] 考勤加载失败', error)
    }
  }

  function memberById(id: string): Member | undefined {
    return members.value.find((member) => member.id === id)
  }

  return {
    departments,
    members,
    attendance,
    directoryLoaded,
    loadingDirectory,
    loadDirectory,
    loadAttendance,
    memberById,
  }
})
