<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseDrawer from '@/shared/components/base/BaseDrawer.vue'
import BaseInput from '@/shared/components/base/BaseInput.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import { useAuthStore } from '@/core/auth/store'
import { toast } from '@/shared/composables/useToast'
import { formatFileSize, formatRelativeTime } from '@/shared/utils/format'
import { useWorkflowsStore } from '../store'
import type { ApprovalItem, ApprovalStepStatus, ApprovalStatus } from '../types'

const props = defineProps<{ approval: ApprovalItem | null }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()
const auth = useAuthStore()
const workflows = useWorkflowsStore()

const comment = ref('')
const commentError = ref('')
const busy = ref(false)

watch(
  () => props.approval?.id,
  () => {
    comment.value = ''
    commentError.value = ''
  },
)

const actionable = computed(
  () =>
    !!props.approval &&
    props.approval.status === 'pending' &&
    props.approval.currentApproverId === auth.user?.id,
)

const STATUS_TONE: Record<ApprovalStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
}

const STEP_META: Record<ApprovalStepStatus, { icon: 'check-circle' | 'x-circle' | 'clock' | 'info'; tone: 'success' | 'danger' | 'primary' | 'neutral' }> = {
  done: { icon: 'check-circle', tone: 'success' },
  rejected: { icon: 'x-circle', tone: 'danger' },
  active: { icon: 'clock', tone: 'primary' },
  waiting: { icon: 'info', tone: 'neutral' },
  skipped: { icon: 'info', tone: 'neutral' },
}

function relative(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}

function onAttachment(): void {
  toast.info(t('common.comingSoon'))
}

async function decide(action: 'approve' | 'reject'): Promise<void> {
  if (!props.approval || busy.value) return
  if (action === 'reject' && !comment.value.trim()) {
    commentError.value = t('ops.workflows.detail.rejectCommentRequired')
    return
  }
  commentError.value = ''
  busy.value = true
  try {
    await workflows.decide(props.approval.id, { action, comment: comment.value.trim() })
    toast.success(
      action === 'approve'
        ? t('ops.workflows.detail.approvedMsg')
        : t('ops.workflows.detail.rejectedMsg'),
    )
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.empty'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDrawer :open="!!approval" :title="approval?.title" :width="560" @close="emit('close')">
    <div v-if="approval" class="approval-detail">
      <div class="approval-detail__tags">
        <BaseTag tone="info">{{ t(`ops.workflows.type.${approval.type}`) }}</BaseTag>
        <BaseTag :tone="STATUS_TONE[approval.status]" dot>
          {{ t(`ops.workflows.status.${approval.status}`) }}
        </BaseTag>
        <BaseTag v-if="approval.urgent" tone="danger">{{ t('ops.workflows.urgent') }}</BaseTag>
        <span class="approval-detail__submitted">
          {{ t('ops.workflows.applicant') }}：{{ approval.applicant.name }}（{{ approval.applicant.department }}）·
          {{ relative(approval.submittedAt) }}
        </span>
      </div>

      <!-- AI 智能摘要 -->
      <section v-if="approval.aiSummary.highlights.length" class="approval-detail__summary">
        <div class="approval-detail__summary-head">
          <span class="approval-detail__summary-title">
            <Icon name="sparkles" :size="15" />
            {{ t('ops.workflows.detail.summary') }}
          </span>
          <BaseTag tone="ai">{{ t('common.ai.generated') }}</BaseTag>
        </div>
        <ul class="approval-detail__highlights">
          <li v-for="(highlight, index) in approval.aiSummary.highlights" :key="index">
            <span class="approval-detail__dot" />
            {{ highlight }}
          </li>
        </ul>
        <p v-if="approval.aiSummary.risk" class="approval-detail__risk">
          <Icon name="alert-triangle" :size="14" />
          <span><strong>{{ t('ops.workflows.detail.risk') }}</strong>：{{ approval.aiSummary.risk }}</span>
        </p>
        <p class="approval-detail__disclaimer">{{ t('common.ai.disclaimer') }}</p>
      </section>

      <!-- 申请信息 -->
      <section>
        <p class="approval-detail__section-title">{{ t('ops.workflows.detail.info') }}</p>
        <dl class="approval-detail__fields">
          <div v-for="field in approval.fields" :key="field.key" class="approval-detail__field">
            <dt>{{ field.label }}</dt>
            <dd>{{ field.value }}</dd>
          </div>
        </dl>
      </section>

      <!-- 附件 -->
      <section v-if="approval.attachments.length">
        <p class="approval-detail__section-title">{{ t('ops.workflows.detail.attachments') }}</p>
        <button
          v-for="attachment in approval.attachments"
          :key="attachment.id"
          class="approval-detail__attachment"
          @click="onAttachment"
        >
          <Icon name="paperclip" :size="15" />
          <span class="u-truncate">{{ attachment.name }}</span>
          <span class="approval-detail__attachment-size">{{ formatFileSize(attachment.sizeBytes) }}</span>
          <Icon name="download" :size="15" class="approval-detail__attachment-icon" />
        </button>
      </section>

      <!-- 审批流程 -->
      <section>
        <p class="approval-detail__section-title">{{ t('ops.workflows.detail.timeline') }}</p>
        <ol class="timeline">
          <li v-for="(step, index) in approval.steps" :key="step.id" class="timeline__step" :class="{ 'timeline__step--last': index === approval.steps.length - 1 }">
            <span class="timeline__marker" :class="`timeline__marker--${STEP_META[step.status].tone}`">
              <Icon :name="STEP_META[step.status].icon" :size="13" :stroke-width="2.2" />
            </span>
            <div class="timeline__body">
              <div class="timeline__head">
                <span class="timeline__node">{{ step.nodeName }}</span>
                <BaseTag
                  v-if="step.status === 'active' || step.status === 'rejected'"
                  :tone="step.status === 'active' ? 'primary' : 'danger'"
                  size="sm"
                >
                  {{ t(`ops.workflows.step.${step.status}`) }}
                </BaseTag>
              </div>
              <div class="timeline__meta">
                <template v-if="step.approver">
                  <BaseAvatar :name="step.approver.name" :size="20" />
                  <span>{{ step.approver.name }}</span>
                </template>
                <span v-if="step.actedAt" class="timeline__time">{{ relative(step.actedAt) }}</span>
              </div>
              <p v-if="step.comment" class="timeline__comment">「{{ step.comment }}」</p>
            </div>
          </li>
        </ol>
      </section>

      <!-- 审批操作 -->
      <section v-if="actionable" class="approval-detail__decision">
        <BaseInput
          v-model="comment"
          :label="t('ops.workflows.detail.comment')"
          :placeholder="t('ops.workflows.detail.commentPlaceholder')"
          :error="commentError"
        />
      </section>
    </div>

    <template #footer>
      <template v-if="actionable">
        <BaseButton variant="secondary" :loading="busy" @click="decide('reject')">
          {{ t('ops.workflows.detail.reject') }}
        </BaseButton>
        <BaseButton variant="primary" :loading="busy" @click="decide('approve')">
          {{ t('ops.workflows.detail.approve') }}
        </BaseButton>
      </template>
    </template>
  </BaseDrawer>
</template>

<style scoped>
.approval-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.approval-detail__tags {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.approval-detail__submitted {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

/* ---- AI 摘要 ---- */
.approval-detail__summary {
  padding: var(--space-4);
  background: var(--color-ai-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.approval-detail__summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.approval-detail__summary-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-ai-1);
}

.approval-detail__highlights {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.approval-detail__highlights li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: var(--font-sm);
  line-height: 1.65;
  color: var(--color-text-1);
}

.approval-detail__dot {
  width: 6px;
  height: 6px;
  margin-top: 7px;
  border-radius: var(--radius-full);
  background: var(--color-ai-1);
  flex-shrink: 0;
}

.approval-detail__risk {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: 8px 10px;
  background: var(--color-warning-soft);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  line-height: 1.6;
  color: var(--color-warning-text);
}

.approval-detail__risk :deep(svg) {
  margin-top: 2px;
  flex-shrink: 0;
}

.approval-detail__disclaimer {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

/* ---- 申请信息 ---- */
.approval-detail__section-title {
  margin-bottom: var(--space-3);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
}

.approval-detail__fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.approval-detail__field {
  display: flex;
  gap: var(--space-3);
  font-size: var(--font-md);
}

.approval-detail__field dt {
  width: 76px;
  flex-shrink: 0;
  color: var(--color-text-3);
}

.approval-detail__field dd {
  color: var(--color-text-1);
  min-width: 0;
}

/* ---- 附件 ---- */
.approval-detail__attachment {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  color: var(--color-text-1);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.approval-detail__attachment + .approval-detail__attachment {
  margin-top: var(--space-2);
}

.approval-detail__attachment:hover {
  background: var(--color-surface-2);
}

.approval-detail__attachment-size {
  margin-left: auto;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.approval-detail__attachment-icon {
  color: var(--color-primary);
}

/* ---- 时间线 ---- */
.timeline {
  display: flex;
  flex-direction: column;
}

.timeline__step {
  position: relative;
  display: flex;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
}

.timeline__step--last {
  padding-bottom: 0;
}

/* 连接线 */
.timeline__step:not(.timeline__step--last)::before {
  content: '';
  position: absolute;
  left: 12px;
  top: 26px;
  bottom: 2px;
  width: 1px;
  background: var(--color-border);
}

.timeline__marker {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  background: var(--color-surface);
}

.timeline__marker--success {
  background: var(--color-success-soft);
  color: var(--color-success-text);
}

.timeline__marker--danger {
  background: var(--color-danger-soft);
  color: var(--color-danger-text);
}

.timeline__marker--primary {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}

.timeline__marker--neutral {
  background: var(--color-surface-3);
  color: var(--color-text-3);
}

.timeline__body {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}

.timeline__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.timeline__node {
  font-size: var(--font-md);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
}

.timeline__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.timeline__time {
  margin-left: var(--space-1);
}

.timeline__comment {
  margin-top: 6px;
  padding: 6px 10px;
  background: var(--color-surface-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  color: var(--color-text-2);
}

.approval-detail__decision {
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}
</style>
