<script setup lang="ts">
/**
 * 成员信息页（右侧内容区）。
 *
 * 从左侧成员列表点击进入；展示成员资料，底部「交流」按钮创建或复用私聊。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import { useAuthStore } from '@/core/auth/store'
import { toast } from '@/shared/composables/useToast'
import { useChatStore } from '@/modules/chat'
import { useIdentityStore } from './store'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const identity = useIdentityStore()
const chat = useChatStore()

const busy = ref(false)

const memberId = computed(() =>
  typeof route.params.memberId === 'string' ? route.params.memberId : '',
)
const member = computed(() => identity.memberById(memberId.value) ?? null)
const isSelf = computed(() => member.value?.id === auth.user?.id)

const rows = computed(() => {
  const current = member.value
  if (!current) return []
  return [
    { label: t('panel.profile.employeeId'), value: current.employeeId },
    { label: t('panel.profile.department'), value: current.department || '—' },
    { label: t('panel.profile.position'), value: current.position || '—' },
    { label: t('panel.profile.email'), value: current.email || '—' },
    { label: t('panel.profile.phone'), value: current.phone || '—' },
  ]
})

onMounted(() => {
  void identity.loadDirectory()
})

function goBack(): void {
  if (window.history.length > 1) router.back()
  else void router.push('/dashboard')
}

async function startChat(): Promise<void> {
  const current = member.value
  if (!current || isSelf.value || busy.value) return

  busy.value = true
  try {
    const conversation = await chat.ensureDirectConversation(current.id)
    await router.push(`/messages/${conversation.id}`)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('panel.members.chatFailed'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="member-profile">
    <div class="member-profile__bar">
      <BaseButton variant="ghost" size="sm" @click="goBack">
        <template #icon><Icon name="chevron-left" :size="15" /></template>
        {{ t('common.back') }}
      </BaseButton>
      <span class="member-profile__breadcrumb">{{ t('panel.members.infoTitle') }}</span>
    </div>

    <p v-if="identity.loadingDirectory" class="member-profile__state">
      {{ t('common.loading') }}
    </p>

    <section v-else-if="member" class="member-profile__card">
      <header class="member-profile__head">
        <BaseAvatar :name="member.name" :size="64" />
        <div class="member-profile__ident">
          <h2 class="member-profile__name">{{ member.name }}</h2>
          <p class="member-profile__subtitle">
            {{ member.position || '—' }}
            <span class="member-profile__dot">·</span>
            {{ member.department || '—' }}
          </p>
        </div>
      </header>

      <dl class="member-profile__rows">
        <div v-for="row in rows" :key="row.label" class="member-profile__row">
          <dt class="member-profile__label">{{ row.label }}</dt>
          <dd class="member-profile__value">{{ row.value }}</dd>
        </div>
      </dl>

      <footer class="member-profile__actions">
        <BaseButton
          v-if="!isSelf"
          variant="primary"
          :loading="busy"
          @click="startChat"
        >
          <template #icon><Icon name="chat" :size="15" /></template>
          {{ t('panel.members.chat') }}
        </BaseButton>
        <span v-else class="member-profile__self">{{ t('panel.members.selfHint') }}</span>
      </footer>
    </section>

    <p v-else class="member-profile__state">
      {{ t('panel.members.notFound') }}
    </p>
  </div>
</template>

<style scoped>
.member-profile {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
}

.member-profile__bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.member-profile__breadcrumb {
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.member-profile__card {
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xs);
}

.member-profile__head {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.member-profile__ident {
  min-width: 0;
}

.member-profile__name {
  font-size: var(--font-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.member-profile__subtitle {
  margin-top: 4px;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.member-profile__dot {
  margin: 0 4px;
}

.member-profile__rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5) 0;
}

.member-profile__row {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.member-profile__label {
  flex-shrink: 0;
  width: 64px;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.member-profile__value {
  min-width: 0;
  font-size: var(--font-md);
  color: var(--color-text-1);
  overflow-wrap: anywhere;
}

.member-profile__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.member-profile__self {
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.member-profile__state {
  padding: var(--space-6);
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
</style>
