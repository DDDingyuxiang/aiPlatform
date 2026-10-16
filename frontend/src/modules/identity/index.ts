/** identity 模块公开导出：跨模块仅可经由本文件引用 */
export { useIdentityStore } from './store'
export { default as ProfileCard } from './components/ProfileCard.vue'
export { default as MemberDirectory } from './components/MemberDirectory.vue'
/** 组织成员演示数据：供其他模块的 Mock 复用，后端 identity 就绪后随各 Mock 一并删除 */
export { MEMBERS } from './data'
export type {
  AttendanceDay,
  AttendanceResult,
  AttendanceStatus,
  Department,
  DirectoryResult,
  Member,
} from './types'
