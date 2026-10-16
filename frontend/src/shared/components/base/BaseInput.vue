<script setup lang="ts">
import { useId } from 'vue'
import Icon from '../Icon.vue'
import type { IconName } from '../icon-registry'

withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    type?: string
    placeholder?: string
    /** 错误信息（展示时自动进入错误态） */
    error?: string
    hint?: string
    disabled?: boolean
    required?: boolean
    prefixIcon?: IconName
    autocomplete?: string
    name?: string
    maxlength?: number | string
  }>(),
  { type: 'text' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  enter: []
}>()

const id = useId()

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
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
      <Icon v-if="prefixIcon" :name="prefixIcon" :size="16" class="field__icon" />
      <input
        :id="id"
        class="field__input"
        :value="modelValue"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :autocomplete="autocomplete"
        :name="name"
        :maxlength="maxlength"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? `${id}-error` : hint ? `${id}-hint` : undefined"
        @input="onInput"
        @keydown.enter="emit('enter')"
      />
      <div v-if="$slots.suffix" class="field__suffix">
        <slot name="suffix" />
      </div>
    </div>
    <p v-if="error" :id="`${id}-error`" class="field__message field__message--error" role="alert">
      {{ error }}
    </p>
    <p v-else-if="hint" :id="`${id}-hint`" class="field__message">{{ hint }}</p>
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
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 38px;
  padding: 0 var(--space-3);
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

.field__control--error:focus-within {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px var(--color-danger-soft);
}

.field__control--disabled {
  background: var(--color-surface-2);
  opacity: 0.7;
}

.field__icon {
  color: var(--color-text-3);
}

.field__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-md);
  color: var(--color-text-1);
}

.field__input::placeholder {
  color: var(--color-text-3);
}

.field__input:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 1000px var(--color-surface) inset;
  -webkit-text-fill-color: var(--color-text-1);
}

.field__suffix {
  display: inline-flex;
  align-items: center;
  color: var(--color-text-3);
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
