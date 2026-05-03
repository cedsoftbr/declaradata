import {
  type ImportExcelResponse,
  type PaginatedResponse,
  request,
} from '@/lib/api-client'

export type City = {
  id: string
  name: string
  uf: string
  ibge_code: string
}

export const locationsApi = {
  list: (
    token: string,
    params?: {
      uf?: string
      ibge_code?: string
      search?: string
      page?: number
      page_size?: number
    }
  ) => {
    const qs = new URLSearchParams()
    if (params?.uf) qs.set('uf', params.uf)
    if (params?.ibge_code) qs.set('ibge_code', params.ibge_code)
    if (params?.search) qs.set('search', params.search)
    if (params?.page && params.page > 1) qs.set('page', String(params.page))
    if (params?.page_size) qs.set('page_size', String(params.page_size))
    const query = qs.toString() ? `?${qs}` : ''
    return request<PaginatedResponse<City>>(`/api/locations/cities/${query}`, { token })
  },

  create: (token: string, data: Partial<City>) =>
    request<City>('/api/locations/cities/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  bulkCreate: (
    token: string,
    data: { name: string; uf: string; ibge_code: string }[]
  ) =>
    request<{ imported: number }>('/api/locations/cities/bulk/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  update: (token: string, id: string, data: Partial<City>) =>
    request<City>(`/api/locations/cities/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, id: string) =>
    request<void>(`/api/locations/cities/${id}/`, {
      method: 'DELETE',
      token,
    }),

  importExcel: (token: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<ImportExcelResponse>('/api/locations/cities/import-excel/', {
      method: 'POST',
      body: formData,
      token,
    })
  },
}
