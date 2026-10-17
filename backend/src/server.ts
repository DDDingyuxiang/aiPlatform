import { createApp } from './app.js'
import { loadAppConfig } from './config/index.js'
import { loadEnvFile } from './config/env.js'
import { createDatabasePool, pingDatabase } from './infra/db.js'
import {
  createAdminRouter,
  createAuthMiddleware,
  createAuthRouter,
  createBcryptPasswordVerifier,
  createIdentityRouter,
  createIdentityService,
  createMySqlIdentityRepository,
  createRequireAnyPermission,
  createTokenService,
} from './modules/identity/index.js'
import { createLogger } from './shared/logger.js'

async function main(): Promise<void> {
  loadEnvFile()
  const config = loadAppConfig()
  const logger = createLogger(config.env === 'development' ? 'debug' : 'info')

  const pool = createDatabasePool(config.database)
  await pingDatabase(pool)

  const repository = createMySqlIdentityRepository(pool)
  const tokens = createTokenService({
    secret: config.jwtSecret,
    ttlSeconds: config.jwtTtlSeconds,
  })
  const identityService = createIdentityService({
    repository,
    passwords: createBcryptPasswordVerifier(),
    tokens,
    logger,
    timezone: config.timezone,
  })
  const requireAuth = createAuthMiddleware(tokens)
  const requireAnyPermission = createRequireAnyPermission(identityService)
  const authRouter = createAuthRouter({ service: identityService, requireAuth })
  const identityRouter = createIdentityRouter({ service: identityService, requireAuth })
  const adminRouter = createAdminRouter({
    service: identityService,
    requireAuth,
    requireAnyPermission,
  })

  const app = createApp({
    authRouter,
    identityRouter,
    adminRouter,
    healthCheck: () => pingDatabase(pool),
    corsOrigins: config.corsOrigins,
    logger,
  })

  const server = app.listen(config.port, () => {
    logger.info('server.started', {
      env: config.env,
      port: config.port,
      database: `${config.database.host}:${config.database.port}/${config.database.database}`,
    })
  })

  let shuttingDown = false
  const shutdown = (signal: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('server.shutdown', { signal })

    server.close((error) => {
      if (error) logger.error('server.close_failed', { error: error.message })
      void pool.end().finally(() => process.exit(error ? 1 : 0))
    })

    setTimeout(() => {
      logger.error('server.shutdown_timeout')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error: unknown) => {
  // 此时配置/日志可能尚未就绪，只输出必要信息，避免泄露连接凭证
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'server.start_failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  )
  process.exit(1)
})
