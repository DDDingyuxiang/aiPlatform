<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '@/shared/components/Icon.vue'
import BaseDropdown from '@/shared/components/base/BaseDropdown.vue'
import BaseDropdownItem from '@/shared/components/base/BaseDropdownItem.vue'
import { AVAILABLE_LOCALES, setLocale } from '@/core/i18n'
import { useI18n } from 'vue-i18n'

const { locale, t } = useI18n()

// vue-i18n 的 locale 在切换后需要重新读取以驱动 UI
const current = computed(() => locale.value)
const currentShort = ref(AVAILABLE_LOCALES.find((item) => item.code === current.value)?.short ?? '中')

watch(current, (code) => {
  currentShort.value = AVAILABLE_LOCALES.find((item) => item.code === code)?.short ?? ''
})
</script>

<template>
  <BaseDropdown>
    <template #trigger="{ toggle }">
      <button
        class="icon-btn locale-trigger"
        :title="t('common.locale.label')"
        :aria-label="t('common.locale.label')"
        @click="toggle"
      >
        <Icon name="globe" :size="18" />
        <span class="locale-trigger__label">{{ currentShort }}</span>
      </button>
    </template>
    <template #default="{ close }">
      <BaseDropdownItem
        v-for="option in AVAILABLE_LOCALES"
        :key="option.code"
        :active="current === option.code"
        @click="
          () => {
            setLocale(option.code)
            close()
          }
        "
      >
        {{ option.label }}
      </BaseDropdownItem>
    </template>
  </BaseDropdown>
</template>

<style scoped>
.locale-trigger {
  padding: 0 8px;
}

.locale-trigger__label {
  font-size: var(--font-xs);
  font-weight: var(--weight-medium);
}

@media (max-width: 767px) {
  .locale-trigger__label {
    display: none;
  }
}
</style>
