/** identity 模块公开导出：跨模块仅可经由本文件引用 */
export { useIdentityStore } from './store'
export { default as ProfileCard } from './components/ProfileCard.vue'
export { default as MemberDirectory } from './components/MemberDirectory.vue'
export type {
  AttendanceDay,
  AttendanceResult,
  AttendanceStatus,
  Department,
  DirectoryResult,
  Member,
} from './types'
