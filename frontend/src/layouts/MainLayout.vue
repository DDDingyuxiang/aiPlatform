<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import AppPanel from './components/AppPanel.vue'

const route = useRoute()

/** fluid：应用型全幅视图（如对话），主区取消内边距与最大宽度 */
const fluid = computed(() => route.meta.fluid === true)
</script>

<template>
  <div class="app-shell">
    <AppPanel />
    <div class="app-shell__main">
      <AppHeader />
      <main class="app-shell__content" :class="{ 'app-shell__content--fluid': fluid }">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell__main {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  margin-left: var(--sidebar-width);
}

.app-shell__content {
  flex: 1;
  width: 100%;
  max-width: calc(var(--content-max-width) + var(--space-6) * 2);
  margin: 0 auto;
  padding: var(--space-6);
}

.app-shell__content--fluid {
  max-width: none;
  margin: 0;
  padding: 0;
}

/* 移动端：面板进入抽屉，内容占满 */
@media (max-width: 767px) {
  .app-shell__main {
    margin-left: 0;
  }

  .app-shell__content {
    padding: var(--space-4);
  }

  .app-shell__content--fluid {
    padding: 0;
  }
}
</style>
