import { describe, expect, it } from 'vitest'
import { resolveDatabaseConfig } from '../database.js'

const fileConfig = {
  host: '127.0.0.1',
  port: 3306,
  database: 'ai_platform',
  user: 'ai_platform',
  connectionLimit: 10,
  connectTimeoutMs: 10_000,
}

describe('resolveDatabaseConfig', () => {
  it('连接地址来自配置文件，密码只从环境变量读取', () => {
    const config = resolveDatabaseConfig(fileConfig, { DB_PASSWORD: 'secret' })

    expect(config.host).toBe('127.0.0.1')
    expect(config.database).toBe('ai_platform')
    expect(config.password).toBe('secret')
  })

  it('环境变量覆盖配置文件中的连接地址', () => {
    const config = resolveDatabaseConfig(fileConfig, {
      DB_HOST: 'db.internal',
      DB_PORT: '3307',
      DB_NAME: 'ai_platform_prod',
      DB_USER: 'svc',
      DB_PASSWORD: 'secret',
      DB_CONNECTION_LIMIT: '20',
    })

    expect(config).toMatchObject({
      host: 'db.internal',
      port: 3307,
      database: 'ai_platform_prod',
      user: 'svc',
      connectionLimit: 20,
      password: 'secret',
    })
  })

  it('拒绝把密码写进配置文件', () => {
    expect(() =>
      resolveDatabaseConfig({ ...fileConfig, password: 'must-not-be-here' }, {}),
    ).toThrow()
  })

  it('拒绝非法端口与缺失的必填项', () => {
    expect(() => resolveDatabaseConfig(fileConfig, { DB_PORT: '70000' })).toThrow()
    expect(() => resolveDatabaseConfig({ ...fileConfig, host: '' }, {})).toThrow()
  })
})
