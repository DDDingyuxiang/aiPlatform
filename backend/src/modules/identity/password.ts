import { compare, hash } from 'bcryptjs'
import type { PasswordVerifier } from './types.js'

const BCRYPT_ROUNDS = 12

/** 生产环境的密码校验实现；数据库中只保存哈希 */
export function createBcryptPasswordVerifier(): PasswordVerifier {
  return {
    verify: (plain, passwordHash) => compare(plain, passwordHash),
  }
}

/** 仅供开发种子脚本与测试使用 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_ROUNDS)
}
