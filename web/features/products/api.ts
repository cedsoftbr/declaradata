import {
  type ImportExcelResponse,
  type PaginatedResponse,
  request,
} from '@/lib/api-client'

export type Product = {
  id: string
  descricao: string
  ncm: string
  unit_value: string | null
  created_at: string
  updated_at: string
}

export const productsApi = {
  list: (token: string, params?: { search?: string; page_size?: number }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set('search', params.search)
    if (params?.page_size) qs.set('page_size', String(params.page_size))
    const query = qs.toString() ? `?${qs}` : ''
    return request<PaginatedResponse<Product>>(`/api/products/${query}`, { token })
  },

  get: (token: string, id: string) =>
    request<Product>(`/api/products/${id}/`, { token }),

  create: (token: string, data: Partial<Product>) =>
    request<Product>('/api/products/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  update: (token: string, id: string, data: Partial<Product>) =>
    request<Product>(`/api/products/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, id: string) =>
    request<void>(`/api/products/${id}/`, { method: 'DELETE', token }),

  importExcel: (token: string, file: File, companyId?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (companyId) formData.append('company_id', companyId)
    return request<ImportExcelResponse>('/api/products/products/import-excel/', {
      method: 'POST',
      body: formData,
      token,
    })
  },
}
