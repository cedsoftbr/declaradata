import {
  type ImportExcelResponse,
  type PaginatedResponse,
  request,
} from '@/lib/api-client'

export type NcmCatalogEntry = {
  id: string
  ncm: string
  created_at: string
}

export const ncmCatalogApi = {
  list: (token: string, params?: { page?: number; page_size?: number }) => {
    const qs = new URLSearchParams()
    if (params?.page && params.page > 1) qs.set('page', String(params.page))
    if (params?.page_size) qs.set('page_size', String(params.page_size))
    const query = qs.toString() ? `?${qs}` : ''
    return request<PaginatedResponse<NcmCatalogEntry>>(
      `/api/products/ncm-catalog/${query}`,
      { token }
    )
  },

  check: (token: string, ncm: string) =>
    request<PaginatedResponse<NcmCatalogEntry>>(
      `/api/products/ncm-catalog/?ncm=${ncm}`,
      { token }
    ),

  create: (token: string, data: { ncm: string }) =>
    request<NcmCatalogEntry>('/api/products/ncm-catalog/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, id: string) =>
    request<void>(`/api/products/ncm-catalog/${id}/`, { method: 'DELETE', token }),

  importExcel: (token: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<ImportExcelResponse>('/api/products/ncm-catalog/import-excel/', {
      method: 'POST',
      body: formData,
      token,
    })
  },
}
