<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseDropdown from '@/shared/components/base/BaseDropdown.vue'
import BaseDropdownItem from '@/shared/components/base/BaseDropdownItem.vue'
import type { IconName } from '@/shared/components/icon-registry'
import type { ThemeMode } from '@/core/config/types'
import { useTheme } from '@/core/theme'

const { t } = useI18n()
const { mode, setMode } = useTheme()

const OPTIONS: { value: ThemeMode; icon: IconName; labelKey: string }[] = [
  { value: 'light', icon: 'sun', labelKey: 'common.theme.light' },
  { value: 'dark', icon: 'moon', labelKey: 'common.theme.dark' },
  { value: 'system', icon: 'monitor', labelKey: 'common.theme.system' },
]

const currentIcon = computed(
  () => OPTIONS.find((option) => option.value === mode.value)?.icon ?? 'monitor',
)
</script>

<template>
  <BaseDropdown>
    <template #trigger="{ toggle }">
      <button
        class="icon-btn"
        :title="t('common.theme.label')"
        :aria-label="t('common.theme.label')"
        @click="toggle"
      >
        <Icon :name="currentIcon" :size="18" />
      </button>
    </template>
    <template #default="{ close }">
      <BaseDropdownItem
        v-for="option in OPTIONS"
        :key="option.value"
        :icon="option.icon"
        :active="mode === option.value"
        @click="
          () => {
            setMode(option.value)
            close()
          }
        "
      >
        {{ t(option.labelKey) }}
      </BaseDropdownItem>
    </template>
  </BaseDropdown>
</template>
