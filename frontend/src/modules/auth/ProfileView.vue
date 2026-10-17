<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseCard from '@/shared/components/base/BaseCard.vue'
import BaseInput from '@/shared/components/base/BaseInput.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import { useAuthStore } from '@/core/auth/store'
import type { UserProfile } from '@/core/auth/types'
import { toast } from '@/shared/composables/useToast'

const { t } = useI18n()
const auth = useAuthStore()

const form = reactive({
  name: '',
  position: '',
  email: '',
  phone: '',
})
const errors = reactive({ name: '', email: '' })
const saving = ref(false)

const roleLabel = computed(() => (auth.user ? t(`auth.role.${auth.user.role}`) : ''))

function fill(user: UserProfile | null): void {
  form.name = user?.name ?? ''
  form.position = user?.position ?? ''
  form.email = user?.email ?? ''
  form.phone = user?.phone ?? ''
  errors.name = ''
  errors.email = ''
}

watch(() => auth.user, fill, { immediate: true })

function validate(): boolean {
  errors.name = form.name.trim() ? '' : t('auth.profilePage.nameRequired')

  const email = form.email.trim()
  if (!email) errors.email = t('auth.profilePage.emailRequired')
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = t('auth.profilePage.emailInvalid')
  else errors.email = ''

  return !errors.name && !errors.email
}

async function save(): Promise<void> {
  if (saving.value || !validate()) return

  saving.value = true
  try {
    await auth.updateProfile({
      name: form.name.trim(),
      position: form.position.trim() || null,
      email: form.email.trim(),
      phone: form.phone.trim() || null,
    })
    toast.success(t('auth.profilePage.saved'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.empty'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="profile-page">
    <BaseCard :title="t('auth.profile')" :subtitle="t('auth.profilePage.subtitle')">
      <div class="profile-page__identity">
        <BaseAvatar :name="auth.user?.name ?? ''" :size="64" />
        <div class="profile-page__ident">
          <p class="profile-page__name">{{ auth.user?.name }}</p>
          <div class="profile-page__tags">
            <BaseTag tone="primary">{{ roleLabel }}</BaseTag>
            <BaseTag>{{ auth.user?.department }}</BaseTag>
          </div>
        </div>
      </div>

      <dl class="profile-page__readonly">
        <div class="profile-page__row">
          <dt>{{ t('auth.profilePage.username') }}</dt>
          <dd>{{ auth.user?.username }}</dd>
        </div>
        <div class="profile-page__row">
          <dt>{{ t('panel.profile.employeeId') }}</dt>
          <dd>{{ auth.user?.employeeId }}</dd>
        </div>
        <div class="profile-page__row">
          <dt>{{ t('panel.profile.department') }}</dt>
          <dd>{{ auth.user?.department }}</dd>
        </div>
        <div class="profile-page__row">
          <dt>{{ t('auth.profilePage.role') }}</dt>
          <dd>{{ roleLabel }}</dd>
        </div>
      </dl>
      <p class="profile-page__hint">{{ t('auth.profilePage.readOnlyHint') }}</p>

      <form class="profile-page__form" @submit.prevent="save">
        <BaseInput
          v-model="form.name"
          :label="t('auth.profilePage.name')"
          :maxlength="128"
          required
          :error="errors.name"
        />
        <BaseInput
          v-model="form.position"
          :label="t('auth.profilePage.position')"
          :placeholder="t('auth.profilePage.positionPlaceholder')"
          :maxlength="128"
        />
        <BaseInput
          v-model="form.email"
          type="email"
          :label="t('auth.profilePage.email')"
          :maxlength="255"
          required
          :error="errors.email"
        />
        <BaseInput
          v-model="form.phone"
          :label="t('auth.profilePage.phone')"
          :placeholder="t('common.optional')"
          :maxlength="32"
        />
        <div class="profile-page__actions">
          <BaseButton variant="ghost" type="button" @click="fill(auth.user)">
            {{ t('common.reset') }}
          </BaseButton>
          <BaseButton variant="primary" type="submit" :loading="saving">
            {{ saving ? t('auth.profilePage.saving') : t('auth.profilePage.save') }}
          </BaseButton>
        </div>
      </form>
    </BaseCard>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 760px;
  margin: 0 auto;
}

.profile-page__identity {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.profile-page__name {
  font-size: var(--font-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.profile-page__tags {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.profile-page__readonly {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3) var(--space-5);
  margin-top: var(--space-5);
}

.profile-page__row {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  min-width: 0;
}

.profile-page__row dt {
  flex-shrink: 0;
  width: 56px;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.profile-page__row dd {
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--color-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-page__hint {
  margin-top: var(--space-3);
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.profile-page__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-5);
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border);
}

.profile-page__actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@media (max-width: 640px) {
  .profile-page__readonly,
  .profile-page__form {
    grid-template-columns: 1fr;
  }
}
</style>
