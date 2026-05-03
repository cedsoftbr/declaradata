import { NextResponse } from 'next/server'
import { clearRefreshCookie, getRefreshToken, setRefreshCookie } from '@/lib/auth'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function POST(request: Request) {
  const refresh = await getRefreshToken()

  if (!refresh) {
    const response = NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 })
    clearRefreshCookie(response)
    return response
  }

  const res = await proxyFetch(request, '/api/auth/token/refresh/', {
    method: 'POST',
    body: JSON.stringify({ refresh }),
  })

  if (!res.ok) {
    const response = NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 })
    clearRefreshCookie(response)
    return response
  }

  const data = await res.json()
  const access = data.access ?? data.access_token
  const newRefresh = data.refresh ?? data.refresh_token

  const response = NextResponse.json({ access })
  setRefreshCookie(response, newRefresh ?? refresh)
  return response
}
