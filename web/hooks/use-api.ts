'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'

/**
 * Returns a `call` function that:
 * 1. Injects the Bearer token from memory
 * 2. On 401, tries to refresh once and retries
 * 3. On second 401, redirects to /login
 */
export function useApi() {
  const { getAccessToken, refreshAccessToken, setAccessToken } = useAuth()
  const router = useRouter()

  const call = useCallback(
    async (input: string, init: RequestInit = {}): Promise<Response> => {
      let token = getAccessToken()

      if (!token) {
        token = await refreshAccessToken()
      }

      const makeRequest = (t: string | null) => {
        const headers: Record<string, string> = {
          ...(init.headers as Record<string, string>),
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
        }

        if (!(init.body instanceof FormData)) {
          headers['Content-Type'] = 'application/json'
        }

        return fetch(input, {
          ...init,
          cache: 'no-store',
          headers,
        })
      }

      let res = await makeRequest(token)

      if (res.status === 401) {
        token = await refreshAccessToken()
        if (!token) {
          setAccessToken(null)
          router.push('/auth/login')
          return res
        }
        res = await makeRequest(token)
      }

      if (res.status === 401) {
        setAccessToken(null)
        router.push('/auth/login')
      }

      return res
    },
    [getAccessToken, refreshAccessToken, setAccessToken, router]
  )

  /**
   * Helper that calls `call`, but automatically handles errors with a toast.
   * If the request is not OK, it parses the error and shows it.
   */
  const callSafe = useCallback(
    async (input: string, init: RequestInit = {}) => {
      try {
        const res = await call(input, init)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          const errorMsg = data.error || data.detail || 'Ocorreu um erro na requisição.'
          toast.error(errorMsg)
          return null
        }
        return res
      } catch (_err) {
        toast.error('Erro de conexão com o servidor.')
        return null
      }
    },
    [call]
  )

  return { call, callSafe }
}
