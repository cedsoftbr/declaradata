import { type PaginatedResponse, request } from '@/lib/api-client'

export type Plan = {
  id: string
  name: string
  monthly_dce_limit: number
  active_user_limit: number
  price: string
  is_active: boolean
}

export type Invoice = {
  id: string
  company: string
  company_name: string
  plan_name: string
  amount: string
  year: number
  month: number
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  due_date: string
  paid_at: string | null
  notes: string
}

export type PlanPayload = Omit<Partial<Plan>, 'id'>

export const plansApi = {
  list: (token: string, params?: URLSearchParams) =>
    request<PaginatedResponse<Plan>>(
      `/api/billing/plans/${params?.toString() ? `?${params}` : ''}`,
      { token }
    ),

  get: (token: string, id: string) =>
    request<Plan>(`/api/billing/plans/${id}/`, { token }),

  create: (token: string, data: PlanPayload) =>
    request<Plan>('/api/billing/plans/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  update: (token: string, id: string, data: PlanPayload) =>
    request<Plan>(`/api/billing/plans/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, id: string) =>
    request<void>(`/api/billing/plans/${id}/`, { method: 'DELETE', token }),
}

export const invoicesApi = {
  list: (token: string, params?: URLSearchParams) =>
    request<PaginatedResponse<Invoice>>(
      `/api/billing/invoices/${params?.toString() ? `?${params}` : ''}`,
      { token }
    ),

  update: (token: string, id: string, data: { notes?: string }) =>
    request<Invoice>(`/api/billing/invoices/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  markPaid: (token: string, id: string) =>
    request<Invoice>(`/api/billing/invoices/${id}/mark-paid/`, {
      method: 'POST',
      token,
    }),
}
