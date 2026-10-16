<script setup lang="ts">
import Icon from '../Icon.vue'

defineProps<{
  modelValue: boolean
  label?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <label class="checkbox" :class="{ 'checkbox--disabled': disabled }">
    <input
      class="checkbox__input"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="onChange"
    />
    <span class="checkbox__box" aria-hidden="true">
      <Icon name="check" :size="12" :stroke-width="3" class="checkbox__check" />
    </span>
    <span v-if="label || $slots.default" class="checkbox__label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<style scoped>
.checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
}

.checkbox--disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.checkbox__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.checkbox__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border-strong);
  border-radius: var(--radius-xs);
  color: #ffffff;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.checkbox__check {
  opacity: 0;
  transform: scale(0.6);
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-out);
}

.checkbox__input:checked + .checkbox__box {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.checkbox__input:checked + .checkbox__box .checkbox__check {
  opacity: 1;
  transform: scale(1);
}

.checkbox__input:focus-visible + .checkbox__box {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.checkbox__label {
  font-size: var(--font-md);
  color: var(--color-text-1);
}
</style>
