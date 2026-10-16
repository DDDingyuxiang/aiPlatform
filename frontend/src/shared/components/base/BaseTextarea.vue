<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    disabled?: boolean
    /** 高度随内容自动增长（默认开启），上限由 maxHeightPx 控制 */
    autoGrow?: boolean
    maxHeightPx?: number
  }>(),
  { autoGrow: true, maxHeightPx: 160 },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

defineOptions({ inheritAttrs: false })

const textareaRef = ref<HTMLTextAreaElement | null>(null)

function resize(): void {
  const el = textareaRef.value
  if (!el || !props.autoGrow) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, props.maxHeightPx)}px`
}

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  resize()
}

onMounted(resize)

defineExpose({
  focus: () => textareaRef.value?.focus(),
  resize,
})
</script>

<template>
  <textarea
    ref="textareaRef"
    class="textarea"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    rows="1"
    v-bind="$attrs"
    @input="onInput"
  />
</template>

<style scoped>
.textarea {
  display: block;
  width: 100%;
  padding: 9px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  outline: none;
  resize: none;
  font-family: inherit;
  font-size: var(--font-md);
  line-height: 1.55;
  color: var(--color-text-1);
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.textarea::placeholder {
  color: var(--color-text-3);
}

.textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-focus-ring);
}

.textarea:disabled {
  background: var(--color-surface-2);
  opacity: 0.7;
}
</style>
