import { NextResponse } from 'next/server'
import { clearRefreshCookie, getRefreshToken } from '@/lib/auth'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function POST(request: Request) {
  const refresh = await getRefreshToken()

  if (refresh) {
    try {
      await proxyFetch(request, '/api/auth/logout/', {
        method: 'POST',
        body: JSON.stringify({ refresh }),
      })
    } catch {
      // Se o blacklist falhar, limpa o cookie mesmo assim
    }
  }

  const response = NextResponse.json({ ok: true })
  clearRefreshCookie(response)
  return response
}
