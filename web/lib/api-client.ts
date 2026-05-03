import { getServerApiBaseUrl } from '@/lib/backend-url'

// No browser usamos URL relativa → passa pelo proxy Next.js em /api/...
// No servidor (SSR/API routes) precisamos da URL absoluta do Django
function getBaseUrl(): string {
  return typeof window !== 'undefined' ? '' : getServerApiBaseUrl()
}

export type RequestOptions = RequestInit & {
  token?: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { token, ...init } = options

  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const baseUrl = getBaseUrl()
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers })

  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(res.status, body)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

export type ImportExcelResponse = {
  message: string
  created: number
  updated: number
  errors: string[]
}

export type PaginatedResponse<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
