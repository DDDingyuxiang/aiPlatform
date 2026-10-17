import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // 测试不读取本地 .env，避免依赖开发者机器状态
    env: {
      NODE_ENV: 'test',
    },
  },
})
