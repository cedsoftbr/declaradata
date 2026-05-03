function normalizeBaseUrl(raw: string): string {
  const value = raw.trim()
  if (!value) return value
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, '')
  return `http://${value.replace(/\/+$/, '')}`
}

export function getServerApiBaseUrl(): string {
  const internal = normalizeBaseUrl(process.env.API_INTERNAL_URL ?? '')
  if (internal) return internal

  const publicApi = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL ?? '')
  if (publicApi) return publicApi

  if (process.env.NODE_ENV !== 'production') return 'http://127.0.0.1:8000'

  throw new Error(
    'API_INTERNAL_URL nao definido em producao. Defina API_INTERNAL_URL com o private domain do servico drf no Railway.'
  )
}
