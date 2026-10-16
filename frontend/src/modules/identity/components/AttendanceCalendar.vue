<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AttendanceDay, AttendanceStatus } from '../types'

const props = defineProps<{
  days: AttendanceDay[]
  /** YYYY-MM；缺省时取当前月份 */
  month?: string
}>()

const { t } = useI18n()

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const weekdays = computed(() => WEEKDAY_KEYS.map((key) => t(`panel.attendance.weekdays.${key}`)))

const statusByDate = computed(() => {
  const map = new Map<string, AttendanceStatus>()
  for (const day of props.days) map.set(day.date, day.status)
  return map
})

interface Cell {
  key: string
  day: number | null
  status?: AttendanceStatus
  isToday: boolean
}

const cells = computed<Cell[]>(() => {
  const base = props.month ? new Date(`${props.month}-01T00:00:00`) : new Date()
  const year = base.getFullYear()
  const month = base.getMonth()
  // 周一作为第一列
  const leadingPad = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const result: Cell[] = []
  for (let i = 0; i < leadingPad; i += 1) {
    result.push({ key: `pad-${i}`, day: null, isToday: false })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    result.push({
      key: date,
      day,
      status: statusByDate.value.get(date),
      isToday:
        today.getFullYear() === year && today.getMonth() === month && today.getDate() === day,
    })
  }
  return result
})
</script>

<template>
  <div class="attendance">
    <div class="attendance__weekdays" aria-hidden="true">
      <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
    </div>
    <div class="attendance__grid">
      <span
        v-for="cell in cells"
        :key="cell.key"
        class="attendance__cell"
        :class="[
          cell.status ? `attendance__cell--${cell.status}` : '',
          { 'attendance__cell--today': cell.isToday },
        ]"
      >
        {{ cell.day ?? '' }}
      </span>
    </div>
    <ul class="attendance__legend">
      <li><span class="attendance__dot attendance__dot--normal" />{{ t('panel.attendance.normal') }}</li>
      <li><span class="attendance__dot attendance__dot--late" />{{ t('panel.attendance.late') }}</li>
      <li><span class="attendance__dot attendance__dot--absent" />{{ t('panel.attendance.absent') }}</li>
    </ul>
  </div>
</template>

<style scoped>
.attendance {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.attendance__weekdays,
.attendance__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}

.attendance__weekdays span {
  text-align: center;
  font-size: 11px;
  color: var(--color-text-3);
}

.attendance__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
  color: var(--color-text-3);
  font-variant-numeric: tabular-nums;
}

.attendance__cell--today {
  box-shadow: inset 0 0 0 1.5px var(--color-primary);
}

.attendance__cell--normal {
  background: var(--color-success-soft);
  color: var(--color-success-text);
}

.attendance__cell--late {
  background: var(--color-warning-soft);
  color: var(--color-warning-text);
}

.attendance__cell--absent {
  background: var(--color-danger-soft);
  color: var(--color-danger-text);
}

.attendance__legend {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: 4px;
}

.attendance__legend li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.attendance__dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
}

.attendance__dot--normal {
  background: var(--color-success);
}

.attendance__dot--late {
  background: var(--color-warning);
}

.attendance__dot--absent {
  background: var(--color-danger);
}
</style>
