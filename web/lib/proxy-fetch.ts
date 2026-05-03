/**
 * Helper para proxy routes do Next.js.
 * Extrai token da request e faz fetch ao Django
 * com os headers corretos (Authorization).
 */
import { getServerApiBaseUrl } from '@/lib/backend-url'

function errorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const lines = [`${error.name}: ${error.message}`]
  const cause = (error as Error & { cause?: unknown }).cause

  if (cause instanceof AggregateError) {
    lines.push(`cause: ${cause.name}: ${cause.message}`)
    for (const [idx, item] of cause.errors.entries()) {
      if (item instanceof Error) {
        const code = (item as Error & { code?: string }).code
        lines.push(
          `cause.errors[${idx}]: ${item.name}: ${item.message}${code ? ` (code=${code})` : ''}`
        )
      } else {
        lines.push(`cause.errors[${idx}]: ${String(item)}`)
      }
    }
  } else if (cause instanceof Error) {
    lines.push(`cause: ${cause.name}: ${cause.message}`)
  } else if (cause !== undefined) {
    lines.push(`cause: ${String(cause)}`)
  }

  return lines.join(' | ')
}

async function fetchWithDebug(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    console.error(`[proxy-fetch] request failed: ${url} :: ${errorDetails(error)}`)
    throw error
  }
}

export function proxyHeaders(request: Request): HeadersInit {
  const token = request.headers.get('Authorization')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers.Authorization = token
  }
  return headers
}

export async function proxyFetch(
  request: Request,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const djangoUrl = getServerApiBaseUrl()

  // Encaminha a query string original se o path fornecido não tiver uma própria
  let finalPath = path
  if (!path.includes('?')) {
    const { search } = new URL(request.url)
    if (search) finalPath += search
  }

  const url = `${djangoUrl}${finalPath}`
  return fetchWithDebug(url, {
    ...init,
    headers: {
      ...proxyHeaders(request),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
}

export async function backendFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const djangoUrl = getServerApiBaseUrl()
  const url = `${djangoUrl}${path}`
  return fetchWithDebug(url, init)
}
