<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    /** 主体内边距；表格类内容使用 none 由内容自管 */
    padding?: 'none' | 'sm' | 'md'
  }>(),
  { padding: 'md' },
)
</script>

<template>
  <section class="card">
    <header v-if="title || subtitle || $slots.header || $slots.actions" class="card__header">
      <div class="card__titles">
        <h3 v-if="title" class="card__title">{{ title }}</h3>
        <p v-if="subtitle" class="card__subtitle">{{ subtitle }}</p>
        <slot name="header" />
      </div>
      <div v-if="$slots.actions" class="card__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="card__body" :class="`card__body--pad-${padding}`">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
}

.card__header + .card__body--pad-md,
.card__header + .card__body--pad-sm {
  border-top: 1px solid var(--color-border);
}

.card__titles {
  min-width: 0;
}

.card__title {
  font-size: var(--font-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.card__subtitle {
  margin-top: 2px;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.card__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.card__body--pad-md {
  padding: var(--space-5);
}

.card__body--pad-sm {
  padding: var(--space-3);
}

.card__body--pad-none {
  padding: 0;
}

.card__header + .card__body--pad-none {
  border-top: 1px solid var(--color-border);
}
</style>
