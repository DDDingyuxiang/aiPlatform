/** 管理端员工/角色接口（后端按权限强制校验范围） */
import { http } from '@/core/http'
import type {
  AdminEmployee,
  AdminEmployeeCreate,
  AdminEmployeeOptions,
  AdminEmployeePage,
  AdminEmployeeQuery,
  AdminEmployeeUpdate,
  AdminRolesResult,
} from './types'

export const systemApi = {
  options: (companyId?: string) =>
    http.get<AdminEmployeeOptions>('/admin/employee-options', {
      params: companyId ? { companyId } : undefined,
    }),

  employees: (query: AdminEmployeeQuery) =>
    http.get<AdminEmployeePage>('/admin/users', { params: query }),

  createEmployee: (payload: AdminEmployeeCreate) =>
    http.post<AdminEmployee>('/admin/users', payload),

  updateEmployee: (id: string, payload: AdminEmployeeUpdate) =>
    http.patch<AdminEmployee>(`/admin/users/${encodeURIComponent(id)}`, payload),

  deleteEmployee: (id: string) =>
    http.delete<{ ok: boolean }>(`/admin/users/${encodeURIComponent(id)}`),

  roles: (companyId?: string) =>
    http.get<AdminRolesResult>('/admin/roles', {
      params: companyId ? { companyId } : undefined,
    }),
}
