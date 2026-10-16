<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AuthLayout from '@/layouts/AuthLayout.vue'
import Icon from '@/shared/components/Icon.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseCheckbox from '@/shared/components/base/BaseCheckbox.vue'
import BaseInput from '@/shared/components/base/BaseInput.vue'
import { ApiError } from '@/core/http'
import { useAuthStore } from '@/core/auth/store'
import { toast } from '@/shared/composables/useToast'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const form = reactive({ username: '', password: '', remember: true })
const errors = reactive({ username: '', password: '' })
const showPassword = ref(false)

function validate(): boolean {
  errors.username = form.username.trim() ? '' : t('auth.errors.usernameRequired')
  errors.password = form.password ? '' : t('auth.errors.passwordRequired')
  return !errors.username && !errors.password
}

async function onSubmit(): Promise<void> {
  if (!validate() || auth.loggingIn) return
  try {
    await auth.login({
      username: form.username.trim(),
      password: form.password,
      remember: form.remember,
    })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : undefined
    await router.push(redirect ?? { name: 'dashboard' })
  } catch (error) {
    // 登录失败信息展示在密码框下方；文案由错误码映射，不直接透传后端原文
    if (error instanceof ApiError && error.code === 40101) {
      errors.password = t('auth.errors.invalidCredentials')
    } else {
      toast.error(error instanceof Error ? error.message : t('auth.errors.invalidCredentials'))
    }
  }
}
</script>

<template>
  <AuthLayout>
    <div class="login">
      <header>
        <h1 class="login__title">{{ t('auth.title') }}</h1>
        <p class="login__sub">{{ t('auth.subtitle') }}</p>
      </header>

      <form class="login__form" novalidate @submit.prevent="onSubmit">
        <BaseInput
          v-model="form.username"
          :label="t('auth.username')"
          :placeholder="t('auth.usernamePlaceholder')"
          prefix-icon="user"
          autocomplete="username"
          :error="errors.username"
          @enter="onSubmit"
        />

        <BaseInput
          v-model="form.password"
          :label="t('auth.password')"
          :type="showPassword ? 'text' : 'password'"
          :placeholder="t('auth.passwordPlaceholder')"
          prefix-icon="lock"
          autocomplete="current-password"
          :error="errors.password"
          @enter="onSubmit"
        >
          <template #suffix>
            <button
              type="button"
              class="login__eye"
              :aria-label="showPassword ? t('auth.password') : t('auth.password')"
              @click="showPassword = !showPassword"
            >
              <Icon :name="showPassword ? 'eye-off' : 'eye'" :size="16" />
            </button>
          </template>
        </BaseInput>

        <div class="login__row">
          <BaseCheckbox v-model="form.remember">{{ t('auth.remember') }}</BaseCheckbox>
          <button type="button" class="login__forgot" @click="toast.info(t('auth.forgotHint'))">
            {{ t('auth.forgot') }}
          </button>
        </div>

        <BaseButton variant="primary" size="lg" type="submit" block :loading="auth.loggingIn">
          {{ auth.loggingIn ? t('auth.submitting') : t('auth.submit') }}
        </BaseButton>
      </form>

      <div class="login__demo">
        <Icon name="info" :size="15" class="login__demo-icon" />
        <p>
          <span class="login__demo-title">{{ t('auth.demoTitle') }}</span>
          {{ t('auth.demoHint') }}
        </p>
      </div>
    </div>
  </AuthLayout>
</template>

<style scoped>
.login {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: 100%;
  max-width: 384px;
}

.login__title {
  font-size: 28px;
  font-weight: var(--weight-bold);
  color: var(--color-text-1);
}

.login__sub {
  margin-top: var(--space-2);
  font-size: var(--font-md);
  color: var(--color-text-2);
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.login__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.login__forgot {
  font-size: var(--font-sm);
  color: var(--color-primary-text);
}

.login__forgot:hover {
  text-decoration: underline;
}

.login__eye {
  display: inline-flex;
  padding: 2px;
  color: var(--color-text-3);
  transition: color var(--duration-fast) var(--ease-standard);
}

.login__eye:hover {
  color: var(--color-text-1);
}

.login__demo {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: 10px 12px;
  background: var(--color-info-soft);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  line-height: 1.5;
  color: var(--color-info-text);
}

.login__demo-icon {
  margin-top: 2px;
}

.login__demo-title {
  margin-right: var(--space-2);
  font-weight: var(--weight-semibold);
}
</style>
