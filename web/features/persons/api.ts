import {
  type ImportExcelResponse,
  type PaginatedResponse,
  request,
} from '@/lib/api-client'
import type { City } from '../locations/api'

export type PersonAddress = {
  id: string
  label: string
  contact_phone: string
  contact_email: string
  zip_code: string
  address: string
  number: string
  complement: string
  neighborhood: string
  city: City | null
  city_name?: string
  city_uf?: string
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Person = {
  id: string
  company: string
  name: string
  document: string
  person_type: 'juridica' | 'fisica'
  person_type_display: string
  is_carrier: boolean
  is_emitente: boolean
  tp_emit: 1 | 2 | 3
  preferred_series: number
  has_certificate: boolean
  addresses: PersonAddress[]
  // Campos legacy usados na UI antiga: derivados do endereço padrão
  contact_phone?: string
  zip_code?: string
  address?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: City | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PersonCertificateStatus = {
  has_certificate: boolean
  environment: 1 | 2
  cert_expires_at: string | null
  cert_uploaded_at: string | null
}

export type PersonPayload = Omit<Partial<Person>, 'city'> & {
  city_id?: string | null
}

export const personsApi = {
  list: (
    token: string,
    params?: {
      is_carrier?: boolean
      is_emitente?: boolean
      is_active?: boolean
      has_certificate?: boolean
      page_size?: number
      search?: string
    }
  ) => {
    const qs = new URLSearchParams()
    if (params?.is_carrier !== undefined)
      qs.set('is_carrier', String(params.is_carrier))
    if (params?.is_emitente !== undefined)
      qs.set('is_emitente', String(params.is_emitente))
    if (params?.is_active !== undefined) qs.set('is_active', String(params.is_active))
    if (params?.has_certificate !== undefined)
      qs.set('has_certificate', String(params.has_certificate))
    if (params?.page_size !== undefined) qs.set('page_size', String(params.page_size))
    if (params?.search !== undefined) qs.set('search', params.search)
    const query = qs.toString() ? `?${qs}` : ''
    return request<PaginatedResponse<Person>>(`/api/persons/${query}`, { token }).then(
      res => ({
        ...res,
        results: (res.results || []).map(hydrateLegacyAddress),
      })
    )
  },

  get: (token: string, id: string) =>
    request<Person>(`/api/persons/${id}/`, { token }).then(hydrateLegacyAddress),

  create: (token: string, data: PersonPayload) =>
    request<Person>('/api/persons/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  bulkCreate: (token: string, data: PersonPayload[]) =>
    request<{ imported: number }>('/api/persons/bulk/', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  update: (token: string, id: string, data: PersonPayload) =>
    request<Person>(`/api/persons/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, id: string) =>
    request<void>(`/api/persons/${id}/`, { method: 'DELETE', token }),

  importExcel: (token: string, file: File, companyId?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (companyId) formData.append('company_id', companyId)
    return request<ImportExcelResponse>('/api/persons/persons/import-excel/', {
      method: 'POST',
      body: formData,
      token,
    })
  },

  listAddresses: (token: string, personId: string) =>
    request<PersonAddress[]>(`/api/persons/${personId}/addresses/`, { token }),

  createAddress: (
    token: string,
    personId: string,
    data: Omit<Partial<PersonAddress>, 'city'> & { city_id: string }
  ) =>
    request<PersonAddress>(`/api/persons/${personId}/addresses/`, {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  deleteAddress: (token: string, addressId: string) =>
    request<void>(`/api/persons/addresses/${addressId}/`, {
      method: 'DELETE',
      token,
    }),

  setDefaultAddress: (token: string, addressId: string) =>
    request<PersonAddress>(`/api/persons/addresses/${addressId}/set_default/`, {
      method: 'POST',
      token,
    }),

  getCertificateStatus: (token: string, personId: string) =>
    request<PersonCertificateStatus>(`/api/persons/${personId}/certificate/status/`, {
      token,
    }),

  uploadCertificate: (
    token: string,
    personId: string,
    file: File,
    password: string
  ) => {
    const formData = new FormData()
    formData.append('certificate', file)
    formData.append('password', password)
    return request<PersonCertificateStatus>(`/api/persons/${personId}/certificate/`, {
      method: 'POST',
      body: formData,
      token,
    })
  },

  deleteCertificate: (token: string, personId: string) =>
    request<void>(`/api/persons/${personId}/certificate/`, {
      method: 'DELETE',
      token,
    }),
}

function hydrateLegacyAddress(person: Person): Person {
  const defaultAddress =
    person.addresses?.find(a => a.is_active && a.is_default) ||
    person.addresses?.find(a => a.is_active) ||
    null

  if (!defaultAddress) return person

  return {
    ...person,
    contact_phone: defaultAddress.contact_phone,
    zip_code: defaultAddress.zip_code,
    address: defaultAddress.address,
    number: defaultAddress.number,
    complement: defaultAddress.complement,
    neighborhood: defaultAddress.neighborhood,
    city: defaultAddress.city,
  }
}
