import type { CacheStore } from '../../infra/cache.js'
import type {
  AdminEmployeeListQuery,
  IdentityRepository,
  ProfileUpdateRecord,
} from './types.js'

export interface CachedIdentityRepositoryOptions {
  /** 身份数据缓存 TTL（秒） */
  ttlSeconds: number
}

/** 查询对象转稳定字符串，保证缓存键与属性顺序无关 */
function stableQuery(query: AdminEmployeeListQuery): string {
  const entries: Array<[string, unknown]> = [
    ['page', query.page],
    ['pageSize', query.pageSize],
    ['departmentId', query.departmentId],
    ['position', query.position],
    ['status', query.status],
    ['keyword', query.keyword],
  ]
  return entries
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&')
}

/**
 * 为 identity 仓储增加 Redis 缓存。
 *
 * 失效策略：每个租户维护一个版本号，员工/角色相关写操作后自增版本号；
 * 读取键包含版本号，旧缓存自然失效并按 TTL 过期，避免逐键删除。
 * 缓存层故障时直接回退到数据库，不影响业务正确性。
 */
export function createCachedIdentityRepository(
  base: IdentityRepository,
  cache: CacheStore,
  options: CachedIdentityRepositoryOptions,
): IdentityRepository {
  const ttl = options.ttlSeconds
  const versionTtl = Math.max(ttl * 4, 3_600)
  const GLOBAL_VERSION_KEY = 'identity:version:global'

  async function scopeVersion(tenantId: string | null): Promise<number> {
    const key =
      tenantId === null ? GLOBAL_VERSION_KEY : `identity:version:${tenantId}`
    return (await cache.get<number>(key)) ?? 0
  }

  async function tenantKey(
    tenantId: string | null,
    suffix: string,
  ): Promise<string> {
    return `identity:v${await scopeVersion(tenantId)}:${suffix}`
  }

  async function invalidateTenant(tenantId: string): Promise<void> {
    // 同时递增全局版本，让跨租户（tenantId=null）的查询缓存也失效
    await Promise.all([
      cache.increment(`identity:version:${tenantId}`, versionTtl),
      cache.increment(GLOBAL_VERSION_KEY, versionTtl),
    ])
  }

  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = await cache.get<T>(key)
    if (hit !== null) return hit
    const value = await load()
    if (value !== null && value !== undefined) {
      await cache.set(key, value, ttl)
    }
    return value
  }

  async function cachedTenant<T>(
    tenantId: string | null,
    suffix: string,
    load: () => Promise<T>,
  ): Promise<T> {
    return cached(await tenantKey(tenantId, suffix), load)
  }

  return {
    findLoginCandidates: (username) => base.findLoginCandidates(username),

    findProfile(tenantId, employeeId) {
      return cachedTenant(tenantId, `profile:${tenantId}:${employeeId}`, () =>
        base.findProfile(tenantId, employeeId),
      )
    },

    listDepartments(tenantId) {
      return cachedTenant(tenantId, `departments:${tenantId}`, () =>
        base.listDepartments(tenantId),
      )
    },

    listMembers(tenantId) {
      return cachedTenant(tenantId, `members:${tenantId}`, () =>
        base.listMembers(tenantId),
      )
    },

    listAttendance(tenantId, employeeId, startDate, nextMonthStartDate) {
      // 考勤随时间变化且不适合按租户版本整体失效，保持直读
      return base.listAttendance(tenantId, employeeId, startDate, nextMonthStartDate)
    },

    async updateProfile(
      tenantId: string,
      employeeId: string,
      changes: ProfileUpdateRecord,
    ) {
      await base.updateProfile(tenantId, employeeId, changes)
      await invalidateTenant(tenantId)
    },

    findCompanyIdByCode(code) {
      return cached(`identity:company-id:${code}`, () => base.findCompanyIdByCode(code))
    },

    listCompanies(tenantId) {
      return cached(`identity:companies:${tenantId ?? 'all'}`, () =>
        base.listCompanies(tenantId),
      )
    },

    listPositions(tenantId) {
      return cachedTenant(tenantId, `positions:${tenantId}`, () =>
        base.listPositions(tenantId),
      )
    },

    findDepartmentInTenant(tenantId, departmentId) {
      return cachedTenant(
        tenantId,
        `department-exists:${tenantId}:${departmentId}`,
        () => base.findDepartmentInTenant(tenantId, departmentId),
      )
    },

    findRolesByCodes(tenantId, codes) {
      const sorted = [...codes].sort()
      return cachedTenant(tenantId, `roles:${tenantId}:${sorted.join(',')}`, () =>
        base.findRolesByCodes(tenantId, sorted),
      )
    },

    listAdminEmployees(tenantId, query) {
      return cachedTenant(
        tenantId,
        `admin-users:${tenantId ?? 'all'}:${stableQuery(query)}`,
        () => base.listAdminEmployees(tenantId, query),
      )
    },

    findAdminEmployee(tenantId, publicId) {
      return cachedTenant(
        tenantId,
        `admin-employee:${tenantId ?? 'all'}:${publicId}`,
        () => base.findAdminEmployee(tenantId, publicId),
      )
    },

    async createAdminEmployee(tenantId, record) {
      await base.createAdminEmployee(tenantId, record)
      await invalidateTenant(tenantId)
    },

    async updateAdminEmployee(tenantId, employeeId, changes, mutationOptions) {
      await base.updateAdminEmployee(tenantId, employeeId, changes, mutationOptions)
      await invalidateTenant(tenantId)
    },

    async softDeleteAdminEmployee(tenantId, employeeId, mutationOptions) {
      await base.softDeleteAdminEmployee(tenantId, employeeId, mutationOptions)
      await invalidateTenant(tenantId)
    },

    listAdminRoles(tenantId) {
      return cachedTenant(tenantId, `admin-roles:${tenantId}`, () =>
        base.listAdminRoles(tenantId),
      )
    },

    listPermissions() {
      return cached('identity:permissions', () => base.listPermissions())
    },
  }
}
