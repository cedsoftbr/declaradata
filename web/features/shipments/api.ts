import { type PaginatedResponse, request } from '@/lib/api-client'
import type { Person } from '../persons/api'

export type ShipmentStatus =
  | 'draft'
  | 'processing'
  | 'authorized'
  | 'cancelled'
  | 'cancelling'
  | 'rejected'

export type ShipmentItem = {
  id: string
  product_id: string | null
  n_item: number
  x_prod: string
  ncm: string
  q_com: string
  v_un_com: string
  v_prod: string
}

export type ShipmentListItem = {
  id: string
  number: number | null
  serie: number
  access_key: string
  status: ShipmentStatus
  tp_amb: 1 | 2 | 3
  emitter_name: string | null
  sender_name: string | null
  sender_city_uf: string | null
  recipient_name: string | null
  recipient_city_uf: string | null
  created_by_name: string | null
  total_value: string
  rejection_reason: string | null
  dh_emi: string | null
  created_at: string
}

export type ShipmentDetail = {
  id: string
  company: string
  sender: string | null
  sender_address?: string | null
  recipient: string
  recipient_address?: string | null
  carrier: string | null
  carrier_address?: string | null
  emitter_detail: Person | null
  sender_detail: Person | null
  recipient_detail: Person | null
  carrier_detail: Person | null
  serie: number
  number: number | null
  c_dc: string
  c_dv: number | null
  tp_emis: number
  tp_emit: number
  tp_amb: 1 | 2 | 3
  transport_mode: number
  tp_transp: 0 | 1 | 2
  status: ShipmentStatus
  access_key: string
  protocol: string
  rejection_reason?: string | null
  info_complementar?: string
  xml_signed: string
  dh_emi: string | null
  dh_recbto: string | null
  emit_snapshot: Record<string, string> | null
  sender_snapshot: Record<string, string> | null
  recipient_snapshot: Record<string, string> | null
  carrier_snapshot: Record<string, string> | null
  marketplace_snapshot: Record<string, string> | null
  sender_name: string | null
  recipient_name: string | null
  total_value: string
  items: ShipmentItem[]
  created_at: string
  updated_at: string
}

export type ShipmentItemPayload = {
  product_id?: string | null
  x_prod: string
  ncm: string
  q_com: number | string
  v_un_com: number | string
}

export type ShipmentPayload = {
  emitter_id?: string | null
  sender_id?: string | null
  recipient_id: string
  carrier_id?: string | null
  sender_address_id?: string | null
  recipient_address_id?: string | null
  carrier_address_id?: string | null
  tp_emit?: number // derivado da empresa no backend — opcional no frontend
  tp_amb?: 1 | 2 | 3 // derivado da empresa no backend — opcional no frontend
  transport_mode: number
  info_complementar?: string
  items: ShipmentItemPayload[]
}

export const shipmentsApi = {
  list: (
    token: string,
    params?: {
      search?: string
      page?: number
      page_size?: number
      user?: string
      emitter?: string
      status?: ShipmentStatus
      after?: string
      before?: string
    }
  ) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set('search', params.search)
    if (params?.page) qs.set('page', String(params.page))
    if (params?.page_size) qs.set('page_size', String(params.page_size))
    if (params?.user) qs.set('user', params.user)
    if (params?.emitter) qs.set('emitter', params.emitter)
    if (params?.status) qs.set('status', params.status)
    if (params?.after) qs.set('created_at_after', params.after)
    if (params?.before) qs.set('created_at_before', params.before)
    const query = qs.toString() ? `?${qs}` : ''
    return request<PaginatedResponse<ShipmentListItem>>(`/api/shipments/${query}`, {
      token,
    })
  },

  get: (token: string, id: string) =>
    request<ShipmentDetail>(`/api/shipments/${id}/`, { token }),

  create: (token: string, data: ShipmentPayload) =>
    request<ShipmentDetail>('/api/shipments/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  update: (token: string, id: string, data: Partial<ShipmentPayload>) =>
    request<ShipmentDetail>(`/api/shipments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, id: string) =>
    request<void>(`/api/shipments/${id}/`, { method: 'DELETE', token }),

  emit: (token: string, id: string) =>
    request<ShipmentDetail>(`/api/shipments/${id}/emit/`, {
      method: 'POST',
      token,
    }),

  cancel: (token: string, id: string, justificativa?: string) =>
    request<ShipmentDetail>(`/api/shipments/${id}/cancel/`, {
      method: 'POST',
      body: JSON.stringify({
        justificativa: justificativa?.trim() || '',
      }),
      token,
    }),

  xmlUrl: (id: string, token?: string) =>
    token ? `/api/shipments/${id}/xml/?token=${token}` : `/api/shipments/${id}/xml/`,
  pdfUrl: (id: string, token?: string) =>
    token ? `/api/shipments/${id}/pdf/?token=${token}` : `/api/shipments/${id}/pdf/`,

  bulkPdfUrl: (ids: string[], token?: string) => {
    const url = `/api/shipments/bulk-pdf/?ids=${ids.join(',')}`
    return token ? `${url}&token=${token}` : url
  },

  dailyEmissions: (token: string, days: number = 30) =>
    request<{ by_ambient: Record<'1' | '2' | '3', Record<string, number>> }>(
      `/api/shipments/daily-emissions/?days=${days}`,
      { token }
    ),

  topEmitters: (token: string, days: number = 30) =>
    request<{ company: string; count: number }[]>(
      `/api/shipments/top-emitters/?days=${days}`,
      { token }
    ),

  ambientSummary: (token: string, companyId?: string) =>
    request<{
      producao: { count: number }
      homologacao: { count: number }
    }>(
      `/api/shipments/ambient-summary/${companyId ? `?company=${companyId}` : ''}`,
      { token }
    ),

  platformSummary: (token: string, companyId?: string) =>
    request<{ active_companies: number; active_users: number }>(
      `/api/shipments/platform-summary/${companyId ? `?company=${companyId}` : ''}`,
      { token }
    ),
}
