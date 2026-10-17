<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseButton from './BaseButton.vue'
import BaseModal from './BaseModal.vue'

withDefaults(
  defineProps<{
    open: boolean
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    tone?: 'danger' | 'primary'
    loading?: boolean
  }>(),
  { tone: 'danger' },
)

const emit = defineEmits<{ confirm: []; close: [] }>()
const { t } = useI18n()
</script>

<template>
  <BaseModal
    :open="open"
    :title="title ?? t('common.confirm')"
    size="sm"
    :close-on-overlay="false"
    @close="emit('close')"
  >
    <p class="confirm__message">{{ message }}</p>
    <template #footer>
      <BaseButton variant="ghost" :disabled="loading" @click="emit('close')">
        {{ cancelText ?? t('common.cancel') }}
      </BaseButton>
      <BaseButton
        :variant="tone === 'danger' ? 'danger' : 'primary'"
        :loading="loading"
        @click="emit('confirm')"
      >
        {{ confirmText ?? t('common.confirm') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.confirm__message {
  font-size: var(--font-md);
  line-height: 1.6;
  color: var(--color-text-2);
}
</style>
