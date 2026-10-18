import { createReadStream, type ReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

export interface LocalFileStorage {
  save(key: string, data: Buffer): Promise<void>
  open(key: string): Promise<ReadStream>
  remove(key: string): Promise<void>
}

/**
 * 通用本地文件存储（聊天附件、知识库原始文件等）。
 *
 * storage_key 由服务端生成，不使用用户文件名作为路径；
 * 读取时再次校验解析后的路径必须位于配置的根目录内，防止路径穿越。
 */
export function createLocalFileStorage(rootDir: string): LocalFileStorage {
  const root = resolve(rootDir)

  function resolveKey(key: string): string {
    const fullPath = resolve(root, key)
    if (fullPath !== root && !fullPath.startsWith(`${root}${sep}`)) {
      throw new Error('非法的文件存储键')
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
