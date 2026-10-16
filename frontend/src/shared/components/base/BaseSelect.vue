<script setup lang="ts">
import { useId } from 'vue'
import Icon from '../Icon.vue'

export interface SelectOption {
  value: string
  label: string
}

withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    options: SelectOption[]
    placeholder?: string
    error?: string
    disabled?: boolean
    required?: boolean
  }>(),
  { placeholder: '' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const id = useId()

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="field">
    <label v-if="label" class="field__label" :for="id">
      {{ label }}<span v-if="required" class="field__required" aria-hidden="true">*</span>
    </label>
    <div
      class="field__control"
      :class="{ 'field__control--error': !!error, 'field__control--disabled': disabled }"
    >
      <select
        :id="id"
        class="field__select"
        :value="modelValue"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        @change="onChange"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <Icon name="chevron-down" :size="15" class="field__caret" />
    </div>
    <p v-if="error" class="field__message field__message--error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
}

.field__label {
  margin-bottom: var(--space-2);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
}

.field__required {
  margin-left: 2px;
  color: var(--color-danger);
}

.field__control {
  position: relative;
  display: flex;
  align-items: center;
  height: 38px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.field__control:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-focus-ring);
}

.field__control--error {
  border-color: var(--color-danger);
}

.field__control--disabled {
  background: var(--color-surface-2);
  opacity: 0.7;
}

.field__select {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 var(--space-7) 0 var(--space-3);
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-md);
  color: var(--color-text-1);
  appearance: none;
  cursor: pointer;
}

.field__select:disabled {
  cursor: not-allowed;
}

.field__caret {
  position: absolute;
  right: var(--space-3);
  color: var(--color-text-3);
  pointer-events: none;
}

.field__message {
  margin-top: var(--space-2);
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.field__message--error {
  color: var(--color-danger-text);
}
</style>
