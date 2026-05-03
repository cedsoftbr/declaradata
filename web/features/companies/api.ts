import { type PaginatedResponse, request } from '@/lib/api-client'
import type { City } from '../locations/api'

export type Company = {
  id: string
  name: string
  trade_name: string
  cnpj: string
  contact_name: string
  contact_phone: string
  contact_email: string
  zip_code: string
  address: string
  number: string
  complement: string
  neighborhood: string
  city: City | null
  is_active: boolean
  environment: 1 | 2 | 3 // 1=Produção, 2=Homologação, 3=Simulado
  current_ambient: 1 | 2 | 3 // ambiente padrão das novas remessas
  use_sefaz_integration: boolean
  plan: { id: string; name: string; price: string } | null
  allow_simulated_environment_for_emitters: boolean
}

export type CompanyPayload = Omit<Partial<Company>, 'city'> & {
  city_id?: string | null
}

export const companiesApi = {
  list: (token: string) =>
    request<PaginatedResponse<Company>>('/api/companies/', { token }),

  get: (token: string, id: string) =>
    request<Company>(`/api/companies/${id}/`, { token }),

  create: (token: string, data: CompanyPayload) =>
    request<Company>('/api/companies/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  update: (token: string, id: string, data: CompanyPayload) =>
    request<Company>(`/api/companies/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, id: string) =>
    request<void>(`/api/companies/${id}/`, {
      method: 'DELETE',
      token,
    }),
}
