<script setup lang="ts">
/** 已持久化的 AI 会话阶段性摘要 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Icon from '@/shared/components/Icon.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import { aiApi } from './api'
import type { AiSummaryHistoryItem } from './types'

const { t, locale } = useI18n()
const router = useRouter()
const items = ref<AiSummaryHistoryItem[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    items.value = await aiApi.listSummaryHistory()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : t('ai.summaryHistory.loadFailed')
  } finally {
    loading.value = false
  }
})

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function openConversation(conversationId: string): void {
  void router.push({ path: '/chat', query: { conversationId } })
}
</script>

<template>
  <section class="summary-history">
    <header class="summary-history__header">
      <div>
        <h2 class="summary-history__title">{{ t('ai.summaryHistory.title') }}</h2>
        <p class="summary-history__description">{{ t('ai.summaryHistory.description') }}</p>
      </div>
      <BaseButton variant="ghost" size="sm" @click="router.push('/chat')">
        <template #icon><Icon name="sparkles" :size="15" /></template>
        {{ t('ai.newChat') }}
      </BaseButton>
    </header>

    <p v-if="loading" class="summary-history__state">{{ t('ai.loading') }}</p>
    <div v-else-if="error" class="summary-history__state summary-history__state--error">
      <Icon name="alert-circle" :size="17" />
      <span>{{ error }}</span>
    </div>
    <div v-else-if="items.length === 0" class="summary-history__empty">
      <span class="summary-history__empty-icon"><Icon name="summary" :size="22" /></span>
      <p>{{ t('ai.summaryHistory.empty') }}</p>
    </div>
    <div v-else class="summary-history__list">
      <article v-for="item in items" :key="item.conversation.id" class="summary-card">
        <header class="summary-card__header">
          <div class="summary-card__heading">
            <h3 class="summary-card__title">{{ item.conversation.title }}</h3>
            <p class="summary-card__meta">
              {{ t('ai.summaryHistory.version', { number: item.summary.summaryNo }) }}
              <span aria-hidden="true">·</span>
              {{ formatDate(item.summary.createdAt) }}
            </p>
          </div>
          <BaseButton
            variant="ghost"
            size="sm"
            @click="openConversation(item.conversation.id)"
          >
            {{ t('ai.summaryHistory.openConversation') }}
            <template #icon><Icon name="arrow-right" :size="14" /></template>
          </BaseButton>
        </header>
        <p class="summary-card__content">{{ item.summary.content }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.summary-history {
  width: min(100%, 920px);
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
}

.summary-history__header,
.summary-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.summary-history__header {
  margin-bottom: var(--space-6);
}

.summary-history__title,
.summary-card__title {
  margin: 0;
  color: var(--color-text-1);
  font-size: var(--font-lg);
  font-weight: 650;
}

.summary-history__description,
.summary-card__meta {
  margin: var(--space-2) 0 0;
  color: var(--color-text-3);
  font-size: var(--font-sm);
}

.summary-history__list {
  display: grid;
  gap: var(--space-4);
}

.summary-card {
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.summary-card__title {
  font-size: var(--font-md);
}

.summary-card__content {
  margin: var(--space-4) 0 0;
  color: var(--color-text-2);
  font-size: var(--font-sm);
  line-height: 1.75;
  white-space: pre-wrap;
}

.summary-history__state,
.summary-history__empty {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-3);
  text-align: center;
}

.summary-history__state--error {
  color: var(--color-danger);
}

.summary-history__empty {
  flex-direction: column;
  padding: var(--space-8);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
}

.summary-history__empty p {
  max-width: 420px;
  margin: 0;
  font-size: var(--font-sm);
  line-height: 1.6;
}

.summary-history__empty-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: var(--color-text-3);
  background: var(--color-surface-3);
  border-radius: 50%;
}

@media (max-width: 640px) {
  .summary-history {
    padding: var(--space-5) var(--space-4);
  }

  .summary-history__header,
  .summary-card__header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
