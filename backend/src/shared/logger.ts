/** 结构化日志：每行一个 JSON，敏感字段由调用方负责排除 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

export function createLogger(level: LogLevel = 'info'): Logger {
  function write(levelName: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[levelName] < LEVEL_WEIGHT[level]) return
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level: levelName,
      message,
      ...fields,
    })
    const stream = levelName === 'error' ? process.stderr : process.stdout
    stream.write(`${line}\n`)
  }

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  }
}
