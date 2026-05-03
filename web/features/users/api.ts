import { request } from '@/lib/api-client'

export type Module = 'products' | 'persons' | 'dce'
export type UserProfile = 'superadmin' | 'admin' | 'emissor' | 'viewer'

export type ModulePermission = {
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

export type PermissionsMap = Partial<Record<Module, ModulePermission>>

export type User = {
  id: string
  email: string
  first_name: string
  last_name: string
  profile: UserProfile
  is_staff: boolean
  is_superuser: boolean
  role_id?: string | null
  role_name?: string | null
  can_manage_users?: boolean
  company_id: string | null
  company_name: string | null
  permissions: PermissionsMap
  legal_terms_version?: string
  terms_accepted_at?: string | null
  privacy_policy_accepted_at?: string | null
  is_active?: boolean
  last_login?: string | null
  date_joined?: string
  allowed_emitente_ids?: string[]
  twofa_enabled?: boolean
}

export const usersApi = {
  me: (token: string) => request<User>('/api/users/me/', { token }),

  updateMe: (token: string, data: Partial<User>) =>
    request<User>('/api/users/me/', {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  setPassword: (
    token: string,
    data: {
      old_password?: string
      new_password1: string
      new_password2: string
    }
  ) =>
    request<void>('/api/users/me/change-password/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  list: (token: string) => request<User[]>('/api/users/', { token }),

  create: (token: string, data: Partial<User>) =>
    request<User>('/api/users/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  get: (token: string, id: string) => request<User>(`/api/users/${id}/`, { token }),

  update: (token: string, id: string, data: Partial<User & { password?: string }>) =>
    request<User>(`/api/users/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, id: string) =>
    request<void>(`/api/users/${id}/`, {
      method: 'DELETE',
      token,
    }),
}
