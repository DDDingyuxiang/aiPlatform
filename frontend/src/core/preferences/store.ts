/**
 * 用户界面偏好（与系统默认配置分离，见 说明.md · 4.2）。
 * 只存放「用户个人化」的界面状态；主题/语言由 theme、i18n 模块各自持久化。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const usePreferencesStore = defineStore('preferences', () => {
  /** 移动端导航抽屉是否打开（不持久化） */
  const mobileNavOpen = ref(false)

  function openMobileNav(): void {
    mobileNavOpen.value = true
  }

  function closeMobileNav(): void {
    mobileNavOpen.value = false
  }

  return { mobileNavOpen, openMobileNav, closeMobileNav }
})
