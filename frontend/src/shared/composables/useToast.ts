/**
 * 轻量全局提示（toast）。
 * 模块级单例状态，由 App.vue 中的 <ToastHost /> 统一渲染。
 */
import { readonly, ref } from 'vue'
import { genId } from '@/shared/utils/id'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  tone: ToastTone
  message: string
}

const toasts = ref<ToastItem[]>([])

function dismiss(id: string): void {
  toasts.value = toasts.value.filter((item) => item.id !== id)
}

function push(tone: ToastTone, message: string, durationMs = 3200): void {
  const id = genId('toast')
  toasts.value.push({ id, tone, message })
  if (durationMs > 0) setTimeout(() => dismiss(id), durationMs)
}

/** 组件外（如 store、服务）也可直接使用 */
export const toast = {
  push,
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message, 4200),
  info: (message: string) => push('info', message),
  warning: (message: string) => push('warning', message, 4000),
  dismiss,
}

export function useToast() {
  return { toasts: readonly(toasts), dismiss, toast }
}
