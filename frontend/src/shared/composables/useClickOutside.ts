import { onBeforeUnmount, type Ref } from 'vue'

/** 指针在目标元素之外按下时触发（用于下拉、气泡等浮层的收起） */
export function useClickOutside(
  target: Ref<HTMLElement | null>,
  handler: (event: PointerEvent) => void,
): void {
  function onPointerDown(event: PointerEvent): void {
    const element = target.value
    if (!element) return
    if (event.target instanceof Node && !element.contains(event.target)) handler(event)
  }

  document.addEventListener('pointerdown', onPointerDown)
  onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
}
