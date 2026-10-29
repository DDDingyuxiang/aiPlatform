/**
 * 员工管理状态。
 *
 * 选项（公司/部门/职位/角色）与列表均来自后端；前端筛选只作为体验，
 * 实际范围由后端按平台超管 / 公司管理员再次判定。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { systemApi } from './api'
import type {
  AdminEmployee,
  AdminEmployeeCreate,
  AdminEmployeeOptions,
  AdminEmployeeQuery,
  AdminEmployeeUpdate,
  AdminRoleRef,
  AdminRoleSummary,
  AdminRolesResult,
  AdminRolePermissionsUpdate,
  CompanySummary,
  PermissionSummary,
} from './types'

export interface EmployeeFilters {
  companyId: string
  departmentId: string
  position: string
  status: '' | AdminEmployee['status']
  keyword: string
}

const EMPTY_FILTERS: EmployeeFilters = {
  companyId: '',
  departmentId: '',
  position: '',
  status: '',
  keyword: '',
}

export const useSystemStore = defineStore('system', () => {
  const companies = ref<CompanySummary[]>([])
  const departments = ref<Array<{ id: string; name: string }>>([])
  const positions = ref<string[]>([])
  const roleOptions = ref<AdminRoleRef[]>([])

  const employees = ref<AdminEmployee[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const optionsLoading = ref(false)
  const error = ref('')
  const loaded = ref(false)

  const roles = ref<AdminRoleSummary[]>([])
  const permissions = ref<PermissionSummary[]>([])
  const rolesLoading = ref(false)

  const filters = ref<EmployeeFilters>({ ...EMPTY_FILTERS })

  /** 平台超管通常能看到多个公司；公司管理员只有一个 */
  const isMultiCompany = computed(() => companies.value.length > 1)
  const hasCompanySelection = computed(() => filters.value.companyId !== '')
  const selectedCompany = computed(
    () => companies.value.find((company) => company.id === filters.value.companyId) ?? null,
  )

  function defaultCompanyId(): string {
    return companies.value.length === 1 ? (companies.value[0]?.id ?? '') : ''
  }

  async function loadOptions(companyId = filters.value.companyId): Promise<void> {
    optionsLoading.value = true
    try {
      const result = await systemApi.options(companyId || undefined)
      companies.value = result.companies
      departments.value = result.departments
      positions.value = result.positions
      roleOptions.value = result.roles
    } catch (loadError) {
      error.value = loadError instanceof Error ? loadError.message : ''
    } finally {
      optionsLoading.value = false
    }
  }

  async function loadEmployees(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const query: AdminEmployeeQuery = {
        page: page.value,
        pageSize: pageSize.value,
        companyId: filters.value.companyId || undefined,
        departmentId: filters.value.departmentId || undefined,
        position: filters.value.position || undefined,
        status: filters.value.status || undefined,
        keyword: filters.value.keyword.trim() || undefined,
      }
      const result = await systemApi.employees(query)
      employees.value = result.items
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
      loaded.value = true
    } catch (loadError) {
      error.value = loadError instanceof Error ? loadError.message : ''
    } finally {
      loading.value = false
    }
  }

  async function initialize(): Promise<void> {
    await loadOptions()
    filters.value.companyId = defaultCompanyId()
    await loadEmployees()
  }

  async function changeCompany(companyId: string): Promise<void> {
    if (filters.value.companyId === companyId) return

    filters.value.companyId = companyId
    filters.value.departmentId = ''
    filters.value.position = ''
    page.value = 1

    await loadOptions(companyId)
    await loadEmployees()
  }

  async function applyFilters(): Promise<void> {
    page.value = 1
    await loadEmployees()
  }

  async function resetFilters(): Promise<void> {
    filters.value = { ...EMPTY_FILTERS, companyId: defaultCompanyId() }
    page.value = 1
    await loadOptions(filters.value.companyId)
    await loadEmployees()
  }

  async function changePage(nextPage: number): Promise<void> {
    if (nextPage < 1 || nextPage === page.value) return
    page.value = nextPage
    await loadEmployees()
  }

  async function fetchCompanyOptions(companyId: string): Promise<AdminEmployeeOptions> {
    return systemApi.options(companyId || undefined)
  }

  async function createEmployee(payload: AdminEmployeeCreate): Promise<AdminEmployee> {
    const created = await systemApi.createEmployee(payload)
    await loadEmployees()
    return created
  }

  async function updateEmployee(
    id: string,
    payload: AdminEmployeeUpdate,
  ): Promise<AdminEmployee> {
    const updated = await systemApi.updateEmployee(id, payload)
    await loadEmployees()
    return updated
  }

  async function removeEmployee(id: string): Promise<void> {
    await systemApi.deleteEmployee(id)
    if (employees.value.length === 1 && page.value > 1) page.value -= 1
    await loadEmployees()
  }

  async function loadRoles(companyId = filters.value.companyId): Promise<void> {
    rolesLoading.value = true
    try {
      const result: AdminRolesResult = await systemApi.roles(companyId || undefined)
      roles.value = result.roles
      permissions.value = result.permissions
    } catch (loadError) {
      roles.value = []
      permissions.value = []
      error.value = loadError instanceof Error ? loadError.message : ''
    } finally {
      rolesLoading.value = false
    }
  }

  async function updateRolePermissions(
    roleCode: string,
    permissions: string[],
    companyId = filters.value.companyId,
  ): Promise<void> {
    const payload: AdminRolePermissionsUpdate = { permissions }
    await systemApi.updateRolePermissions(roleCode, payload, companyId || undefined)
    await loadRoles(companyId)
  }

  return {
    companies,
    departments,
    positions,
    roleOptions,
    employees,
    total,
    page,
    pageSize,
    loading,
    optionsLoading,
    error,
    loaded,
    roles,
    permissions,
    rolesLoading,
    filters,
    isMultiCompany,
    hasCompanySelection,
    selectedCompany,
    initialize,
    loadOptions,
    loadEmployees,
    loadRoles,
    updateRolePermissions,
    changeCompany,
    applyFilters,
    resetFilters,
    changePage,
    fetchCompanyOptions,
    createEmployee,
    updateEmployee,
    removeEmployee,
  }
})
