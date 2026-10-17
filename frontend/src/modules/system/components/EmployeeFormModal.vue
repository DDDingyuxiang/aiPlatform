<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseCheckbox from '@/shared/components/base/BaseCheckbox.vue'
import BaseInput from '@/shared/components/base/BaseInput.vue'
import BaseModal from '@/shared/components/base/BaseModal.vue'
import BaseSelect from '@/shared/components/base/BaseSelect.vue'
import { toast } from '@/shared/composables/useToast'
import { systemApi } from '../api'
import { useSystemStore } from '../store'
import type { AdminEmployee, AdminRoleRef, CompanySummary } from '../types'

const props = defineProps<{
  open: boolean
  employee?: AdminEmployee | null
  companies: CompanySummary[]
  defaultCompanyId?: string
  canSelectCompany: boolean
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

const { t } = useI18n()
const store = useSystemStore()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface FormState {
  companyId: string
  username: string
  employeeNo: string
  name: string
  email: string
  phone: string
  position: string
  departmentId: string
  roleCodes: string[]
  status: AdminEmployee['status']
  initialPassword: string
}

const form = reactive<FormState>({
  companyId: '',
  username: '',
  employeeNo: '',
  name: '',
  email: '',
  phone: '',
  position: '',
  departmentId: '',
  roleCodes: [],
  status: 'active',
  initialPassword: '',
})

const errors = reactive<Record<string, string>>({})
const localDepartments = ref<Array<{ id: string; name: string }>>([])
const localRoles = ref<AdminRoleRef[]>([])
const optionsLoading = ref(false)
const submitting = ref(false)

const isEdit = computed(() => !!props.employee)

function clearErrors(): void {
  for (const key of Object.keys(errors)) delete errors[key]
}

async function loadCompanyOptions(companyId: string): Promise<void> {
  optionsLoading.value = true
  try {
    const result = await systemApi.options(companyId)
    localDepartments.value = result.departments
    localRoles.value = result.roles

    if (props.employee) {
      // 已有部门/角色可能已停用或删除，仍保留在编辑下拉中，避免静默清空
      if (
        props.employee.departmentId &&
        !localDepartments.value.some((department) => department.id === props.employee?.departmentId)
      ) {
        localDepartments.value = [
          ...localDepartments.value,
          { id: props.employee.departmentId, name: props.employee.department },
        ]
      }
      for (const role of props.employee.roles) {
        if (!localRoles.value.some((item) => item.code === role.code)) {
          localRoles.value = [...localRoles.value, role]
        }
      }
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('system.loadFailed'))
  } finally {
    optionsLoading.value = false
  }
}

async function reset(): Promise<void> {
  clearErrors()
  const employee = props.employee

  if (employee) {
    form.companyId = employee.company.id
    form.username = employee.username
    form.employeeNo = employee.employeeId
    form.name = employee.name
    form.email = employee.email
    form.phone = employee.phone
    form.position = employee.position
    form.departmentId = employee.departmentId ?? ''
    form.roleCodes = employee.roles.map((role) => role.code)
    form.status = employee.status
    form.initialPassword = ''
  } else {
    form.companyId =
      props.defaultCompanyId || props.companies.at(0)?.id || ''
    form.username = ''
    form.employeeNo = ''
    form.name = ''
    form.email = ''
    form.phone = ''
    form.position = ''
    form.departmentId = ''
    form.roleCodes = []
    form.status = 'active'
    form.initialPassword = ''
    localDepartments.value = []
    localRoles.value = []
  }

  if (form.companyId) await loadCompanyOptions(form.companyId)

  if (!employee && form.roleCodes.length === 0) {
    const defaultRole = localRoles.value.find((role) => role.code === 'employee')
    if (defaultRole) form.roleCodes = [defaultRole.code]
  }
}

watch(
  () => [props.open, props.employee] as const,
  ([open]) => {
    if (open) void reset()
  },
  { immediate: true },
)

const companyOptions = computed(() =>
  props.companies.map((company) => ({ value: company.id, label: company.name })),
)

const departmentOptions = computed(() => [
  { value: '', label: t('system.form.noDepartment') },
  ...localDepartments.value.map((department) => ({
    value: department.id,
    label: department.name,
  })),
])

const statusOptions = computed(() => [
  { value: 'active', label: t('system.status.active') },
  { value: 'disabled', label: t('system.status.disabled') },
  { value: 'locked', label: t('system.status.locked') },
])

async function onCompanyChange(companyId: string): Promise<void> {
  form.companyId = companyId
  form.departmentId = ''
  form.roleCodes = []
  if (companyId) {
    await loadCompanyOptions(companyId)
    const defaultRole = localRoles.value.find((role) => role.code === 'employee')
    if (defaultRole) form.roleCodes = [defaultRole.code]
  }
}

function toggleRole(code: string, checked: boolean): void {
  if (checked) {
    if (!form.roleCodes.includes(code)) form.roleCodes = [...form.roleCodes, code]
  } else {
    form.roleCodes = form.roleCodes.filter((item) => item !== code)
  }
}

function setStatus(value: string): void {
  form.status = value as AdminEmployee['status']
}

function validate(): boolean {
  clearErrors()

  if (!form.companyId) errors.companyId = t('common.validation.required')
  if (!isEdit.value && !form.username.trim()) {
    errors.username = t('common.validation.required')
  }
  if (!isEdit.value && !form.employeeNo.trim()) {
    errors.employeeNo = t('common.validation.required')
  }
  if (!form.name.trim()) errors.name = t('common.validation.required')

  if (!form.email.trim()) errors.email = t('common.validation.required')
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = t('system.form.emailInvalid')

  if (!isEdit.value) {
    if (!form.initialPassword) errors.initialPassword = t('common.validation.required')
    else if (form.initialPassword.length < 8) {
      errors.initialPassword = t('system.form.passwordTooShort')
    }
  }

  return Object.keys(errors).length === 0
}

async function submit(): Promise<void> {
  if (submitting.value || !validate()) return

  submitting.value = true
  try {
    if (props.employee) {
      await store.updateEmployee(props.employee.id, {
        name: form.name.trim(),
        email: form.email.trim(),
        position: form.position.trim() || null,
        phone: form.phone.trim() || null,
        departmentId: form.departmentId || null,
        roleCodes: form.roleCodes,
        status: form.status,
      })
      toast.success(t('system.messages.updated'))
    } else {
      await store.createEmployee({
        companyId: props.canSelectCompany ? form.companyId : undefined,
        username: form.username.trim(),
        employeeNo: form.employeeNo.trim(),
        email: form.email.trim(),
        name: form.name.trim(),
        position: form.position.trim() || null,
        phone: form.phone.trim() || null,
        departmentId: form.departmentId || null,
        roleCodes: form.roleCodes,
        initialPassword: form.initialPassword,
      })
      toast.success(t('system.messages.created'))
    }

    emit('saved')
    emit('close')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('system.loadFailed'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="isEdit ? t('system.form.titleEdit') : t('system.form.titleCreate')"
    size="lg"
    :close-on-overlay="false"
    @close="emit('close')"
  >
    <div class="employee-form">
      <BaseSelect
        :model-value="form.companyId"
        :label="t('system.form.company')"
        :options="companyOptions"
        :disabled="isEdit || !canSelectCompany"
        :error="errors.companyId"
        required
        @update:model-value="onCompanyChange"
      />

      <div class="employee-form__grid">
        <BaseInput
          v-model="form.username"
          :label="t('system.form.username')"
          :placeholder="t('system.form.usernamePlaceholder')"
          :disabled="isEdit"
          :error="errors.username"
          :hint="isEdit ? t('system.form.usernameImmutable') : undefined"
          required
        />
        <BaseInput
          v-model="form.employeeNo"
          :label="t('system.form.employeeNo')"
          :placeholder="t('system.form.employeeNoPlaceholder')"
          :disabled="isEdit"
          :error="errors.employeeNo"
          required
        />
        <BaseInput
          v-model="form.name"
          :label="t('system.form.name')"
          :placeholder="t('system.form.namePlaceholder')"
          :error="errors.name"
          required
        />
        <BaseInput
          v-model="form.email"
          type="email"
          :label="t('system.form.email')"
          :placeholder="t('system.form.emailPlaceholder')"
          :error="errors.email"
          required
        />
        <BaseInput
          v-model="form.phone"
          :label="t('system.form.phone')"
          :placeholder="t('system.form.phonePlaceholder')"
        />
        <BaseInput
          v-model="form.position"
          :label="t('system.form.position')"
          :placeholder="t('system.form.positionPlaceholder')"
        />
        <BaseSelect
          :model-value="form.departmentId"
          :label="t('system.form.department')"
          :options="departmentOptions"
          :disabled="optionsLoading"
          @update:model-value="form.departmentId = $event"
        />
        <BaseSelect
          v-if="isEdit"
          :model-value="form.status"
          :label="t('system.form.status')"
          :options="statusOptions"
          @update:model-value="setStatus"
        />
        <BaseInput
          v-if="!isEdit"
          v-model="form.initialPassword"
          type="password"
          :label="t('system.form.initialPassword')"
          :placeholder="t('system.form.initialPasswordPlaceholder')"
          :error="errors.initialPassword"
          :hint="t('system.form.initialPasswordHint')"
          autocomplete="new-password"
          required
        />
      </div>

      <div class="employee-form__roles">
        <span class="employee-form__label">{{ t('system.form.roles') }}</span>
        <div v-if="optionsLoading" class="employee-form__hint">{{ t('common.loading') }}</div>
        <div v-else class="employee-form__role-list">
          <BaseCheckbox
            v-for="role in localRoles"
            :key="role.code"
            :model-value="form.roleCodes.includes(role.code)"
            @update:model-value="toggleRole(role.code, $event)"
          >
            {{ role.name }}
            <span class="employee-form__role-code">{{ role.code }}</span>
          </BaseCheckbox>
          <span v-if="localRoles.length === 0" class="employee-form__hint">
            {{ t('system.form.noRoles') }}
          </span>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="ghost" :disabled="submitting" @click="emit('close')">
        {{ t('common.cancel') }}
      </BaseButton>
      <BaseButton variant="primary" :loading="submitting" @click="submit">
        {{ submitting ? t('system.form.saving') : t('system.form.save') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.employee-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.employee-form__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.employee-form__roles {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.employee-form__label {
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
}

.employee-form__role-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.employee-form__role-code {
  margin-left: 4px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.employee-form__hint {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

@media (max-width: 640px) {
  .employee-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
