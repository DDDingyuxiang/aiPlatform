import mysql, { type Pool } from 'mysql2/promise'
import type { DatabaseConfig } from '../config/database.js'

/**
 * MySQL 连接池。
 * - 时间统一按 UTC 处理（库内 DATETIME(3) 均为 UTC）；
 * - BIGINT 以字符串返回，避免超出 JS 安全整数范围后精度丢失。
 */
export function createDatabasePool(config: DatabaseConfig): Pool {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionLimit: config.connectionLimit,
    connectTimeout: config.connectTimeoutMs,
    waitForConnections: true,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
  })
}

/** 健康检查：连接不可用时抛出异常 */
export async function pingDatabase(pool: Pool): Promise<void> {
  await pool.query('SELECT 1')
}
