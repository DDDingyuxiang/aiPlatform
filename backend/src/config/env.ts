import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'

/**
 * 加载后端根目录的 .env。
 * 已存在的进程环境变量优先，不会被 .env 覆盖（便于容器/密钥管理系统注入）。
 */
export function loadEnvFile(): void {
  loadDotenv({
    path: fileURLToPath(new URL('../../.env', import.meta.url)),
    quiet: true,
  })
}
