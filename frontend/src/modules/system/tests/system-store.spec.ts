/**
 * 员工管理 store 测试（基于真实 mock 端点）。
 *
 * 覆盖：平台超管/公司管理员的公司范围、筛选与分页、员工 CRUD、无权限账号。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { clearToken } from '@/core/auth/token'
import '@/core/auth/mock'
import '@/modules/system/mock'
import { resetSystemMockState } from '@/modules/system/mock'
import { useSystemStore } from '@/modules/system/store'

async function settle<T>(promise: Promise<T>, ms = 1200): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms)
  return promise
}

async function settleRejection(promise: Promise<unknown>, ms = 1200): Promise<unknown> {
  let rejection: unknown
  const handled = promise.catch((error: unknown) => {
    rejection = error
  })
  await vi.advanceTimersByTimeAsync(ms)
  await handled
  return rejection
}

async function login(username: string): Promise<void> {
  const auth = useAuthStore()
  const pending = auth.login({ username, password: '123456', remember: true })
  await vi.advanceTimersByTimeAsync(500)
  await pending
}

describe('system employee store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearToken()
    resetSystemMockState()
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('公司管理员初始化后只看到当前公司员工', async () => {
    await login('admin')
    const store = useSystemStore()

    await settle(store.initialize())

    expect(store.companies.map((company) => company.code)).toEqual(['demo'])
    expect(store.filters.companyId).toBe('co-demo')
    expect(store.isMultiCompany).toBe(false)
    expect(store.total).toBe(3)
    expect(store.employees.every((employee) => employee.company.code === 'demo')).toBe(true)
  })

  it('平台超管初始化后可看到全部公司员工', async () => {
    await login('superadmin')
    const store = useSystemStore()

    await settle(store.initialize())

    expect(store.companies.map((company) => company.code)).toEqual(['demo', 'platform'])
    expect(store.filters.companyId).toBe('')
    expect(store.isMultiCompany).toBe(true)
    expect(store.total).toBe(4)
  })

  it('支持按公司、部门与关键字筛选', async () => {
    await login('superadmin')
    const store = useSystemStore()
    await settle(store.initialize())

    await settle(store.changeCompany('co-demo'))
    expect(store.total).toBe(3)
    expect(store.departments.map((department) => department.name)).toContain('市场部')

    store.filters.departmentId = 'dept-demo-market'
    await settle(store.applyFilters())
    expect(store.employees.map((employee) => employee.username)).toEqual(['lisi'])

    store.filters.departmentId = ''
    store.filters.keyword = '赵'
    await settle(store.applyFilters())
    expect(store.employees.map((employee) => employee.username)).toEqual(['zhaoqiang'])
  })

  it('公司管理员可增删改员工', async () => {
    await login('admin')
    const store = useSystemStore()
    await settle(store.initialize())

    const created = await settle(
      store.createEmployee({
        username: 'zhangsan',
        employeeNo: 'E2001',
        email: 'zhangsan@example.com',
        name: '张三',
        departmentId: 'dept-demo-tech',
        roleCodes: ['employee'],
        initialPassword: '12345678',
      }),
    )
    expect(created.username).toBe('zhangsan')
    expect(store.total).toBe(4)

    const updated = await settle(
      store.updateEmployee(created.id, { name: '张三丰', status: 'disabled' }),
    )
    expect(updated.name).toBe('张三丰')
    expect(store.employees.find((employee) => employee.id === created.id)?.status).toBe(
      'disabled',
    )

    await settle(store.removeEmployee(created.id))
    expect(store.total).toBe(3)
  })

  it('重复用户名返回 40902', async () => {
    await login('admin')
    const store = useSystemStore()
    await settle(store.initialize())

    const rejection = await settleRejection(
      store.createEmployee({
        username: 'lisi',
        employeeNo: 'E2002',
        email: 'another@example.com',
        name: '另一个李思',
        initialPassword: '12345678',
      }),
    )
    expect(rejection).toMatchObject({ code: 40902 })
  })

  it('无员工管理权限的账号无法加载管理数据', async () => {
    await login('lisi')
    const store = useSystemStore()

    await settle(store.initialize())

    expect(store.error).toBeTruthy()
    expect(store.total).toBe(0)
    expect(store.employees).toEqual([])
  })
})
