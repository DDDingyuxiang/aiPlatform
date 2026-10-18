<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import { useAuthStore } from '@/core/auth/store'
import { usePreferencesStore } from '@/core/preferences/store'
import { toast } from '@/shared/composables/useToast'
import { useChatStore } from '@/modules/chat'
import { useIdentityStore } from '../store'
import type { Member } from '../types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const preferences = usePreferencesStore()
const chat = useChatStore()
const identity = useIdentityStore()

const selectMode = ref(false)
const selectedIds = ref(new Set<string>())
const expandedDepts = ref(new Set<string>())
const busy = ref(false)

/** 当前正在查看的成员（用于高亮） */
const activeMemberId = computed(() =>
  typeof route.params.memberId === 'string' ? route.params.memberId : '',
)

onMounted(() => {
  void identity.loadDirectory()
})

/** 分区列表：本部门完整展开，其他部门折叠 */
const groups = computed(() => {
  const myDepartment = auth.user?.department ?? ''
  const mine = identity.members.filter((member) => member.department === myDepartment)
  const others = new Map<string, Member[]>()
  for (const member of identity.members) {
    if (member.department === myDepartment) continue
    const list = others.get(member.department) ?? []
    list.push(member)
    others.set(member.department, list)
  }
  return [
    { key: 'mine', label: t('panel.members.myDept'), members: mine, collapsible: false },
    ...[...others.entries()].map(([department, members]) => ({
      key: department,
      label: department,
      members,
      collapsible: true,
    })),
  ]
})

const selectedCount = computed(() => selectedIds.value.size)

function toggleDept(dept: string): void {
  const next = new Set(expandedDepts.value)
  if (next.has(dept)) next.delete(dept)
  else next.add(dept)
  expandedDepts.value = next
}

function toggleSelect(memberId: string): void {
  const next = new Set(selectedIds.value)
  if (next.has(memberId)) next.delete(memberId)
  else next.add(memberId)
  selectedIds.value = next
}

function exitSelectMode(): void {
  selectMode.value = false
  selectedIds.value = new Set()
}

function enterSelectMode(): void {
  selectMode.value = true
}

/** 点击成员：多选模式下切换勾选，普通模式下进入右侧成员信息页 */
function onMemberClick(member: Member): void {
  if (member.id === auth.user?.id) return
  if (selectMode.value) {
    toggleSelect(member.id)
    return
  }
  preferences.closeMobileNav()
  void router.push({ name: 'member-profile', params: { memberId: member.id } })
}

async function startGroup(): Promise<void> {
  if (selectedCount.value === 0 || busy.value) return
  busy.value = true
  try {
    const conversation = await chat.createGroupConversation([...selectedIds.value])
    exitSelectMode()
    preferences.closeMobileNav()
    await router.push(`/messages/${conversation.id}`)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('panel.members.chatFailed'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="members">
    <div class="members__toolbar">
      <template v-if="!selectMode">
        <button class="members__text-btn" @click="enterSelectMode">
          <Icon name="check-circle" :size="14" />
          {{ t('panel.members.selectMode') }}
        </button>
      </template>
      <template v-else>
        <button class="members__text-btn" @click="exitSelectMode">
          {{ t('panel.members.cancel') }}
        </button>
        <span class="members__count">{{ t('panel.members.selected', { count: selectedCount }) }}</span>
      </template>
    </div>

    <div v-for="group in groups" :key="group.key" class="members__group">
      <button
        v-if="group.collapsible"
        class="members__dept"
        :aria-expanded="expandedDepts.has(group.key)"
        @click="toggleDept(group.key)"
      >
        <Icon
          name="chevron-right"
          :size="14"
          class="members__dept-chevron"
          :class="{ 'members__dept-chevron--open': expandedDepts.has(group.key) }"
        />
        <span class="members__dept-name">{{ group.label }}</span>
        <span class="members__dept-count u-tabular">{{ group.members.length }}</span>
      </button>
      <p v-else class="members__group-label">{{ group.label }}</p>

      <ul v-show="!group.collapsible || expandedDepts.has(group.key)" class="members__list">
        <li v-for="member in group.members" :key="member.id">
          <button
            class="member"
            :class="{
              'member--selected': selectedIds.has(member.id),
              'member--self': member.id === auth.user?.id,
              'member--active': activeMemberId === member.id,
            }"
            @click="onMemberClick(member)"
          >
            <span v-if="selectMode" class="member__check" :class="{ 'member__check--on': selectedIds.has(member.id) }">
              <Icon v-if="selectedIds.has(member.id)" name="check" :size="11" :stroke-width="3" />
            </span>
            <BaseAvatar :name="member.name" :size="30" />
            <span class="member__body">
              <span class="member__name-row">
                <span class="member__name u-truncate">{{ member.name }}</span>
                <span v-if="member.id === auth.user?.id" class="member__self-tag">
                  {{ t('panel.members.self') }}
                </span>
              </span>
              <span class="member__position u-truncate">{{ member.position }}</span>
            </span>
            <Icon
              v-if="!selectMode && member.id !== auth.user?.id"
              name="chevron-right"
              :size="13"
              class="member__chevron"
            />
          </button>
        </li>
      </ul>
    </div>

    <div v-if="selectMode" class="members__footer">
      <BaseButton
        variant="primary"
        size="sm"
        block
        :disabled="selectedCount === 0"
        :loading="busy"
        @click="startGroup"
      >
        <template #icon><Icon name="chat" :size="15" /></template>
        {{ t('panel.members.startGroup') }}
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.members {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ---- 工具行 ---- */
.members__toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  min-height: 26px;
}

.members__text-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
  color: var(--color-primary-text);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.members__text-btn:hover {
  background: var(--color-primary-soft);
}

.members__count {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

/* ---- 分组 ---- */
.members__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.members__group + .members__group {
  margin-top: var(--space-2);
}

.members__group-label {
  padding: 4px 8px;
  font-size: var(--font-xs);
  font-weight: var(--weight-medium);
  color: var(--color-text-3);
}

.members__dept {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.members__dept:hover {
  background: var(--color-surface-3);
}

.members__dept-chevron {
  transition: transform var(--duration-fast) var(--ease-standard);
}

.members__dept-chevron--open {
  transform: rotate(90deg);
}

.members__dept-name {
  flex: 1;
  text-align: left;
}

.members__dept-count {
  color: var(--color-text-3);
  font-weight: var(--weight-regular);
}

/* ---- 成员行 ---- */
.members__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.member {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.member:hover {
  background: var(--color-surface-3);
}

.member--selected {
  background: var(--color-primary-soft);
}

.member--active {
  background: var(--color-primary-soft);
}

.member__chevron {
  flex-shrink: 0;
  color: var(--color-text-3);
}

.member--self {
  cursor: default;
  opacity: 0.75;
}

.member--self:hover {
  background: transparent;
}

.member__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border: 1.5px solid var(--color-border-strong);
  border-radius: var(--radius-xs);
  color: #ffffff;
  flex-shrink: 0;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.member__check--on {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.member__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.member__name-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.member__name {
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
  min-width: 0;
}

.member__self-tag {
  padding: 0 5px;
  border-radius: var(--radius-xs);
  background: var(--color-surface-3);
  font-size: 10px;
  color: var(--color-text-3);
  flex-shrink: 0;
}

.member__position {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

/* ---- 底部操作 ---- */
.members__footer {
  margin-top: var(--space-2);
}
</style>
