import { createReadStream, type ReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { AttachmentStorage } from './types.js'

/**
 * 本地磁盘附件存储。
 *
 * storage_key 由服务端生成（租户/会话/ULID），不使用用户文件名作为路径；
 * 读取时再次校验解析后的路径必须位于配置的根目录内，防止路径穿越。
 */
export function createLocalAttachmentStorage(rootDir: string): AttachmentStorage {
  const root = resolve(rootDir)

  function resolveKey(key: string): string {
    const fullPath = resolve(root, key)
    if (fullPath !== root && !fullPath.startsWith(`${root}${sep}`)) {
      throw new Error('非法的附件存储键')
    }
    return fullPath
  }

  return {
    async save(key, data) {
      const fullPath = resolveKey(key)
      await mkdir(dirname(fullPath), { recursive: true })
      await writeFile(fullPath, data)
    },

    async open(key) {
      const fullPath = resolveKey(key)
      await stat(fullPath)
      return createReadStream(fullPath)
    },

    async remove(key) {
      await rm(resolveKey(key), { force: true })
    },
  }
}
