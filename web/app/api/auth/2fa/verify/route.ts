import { NextResponse } from 'next/server'
import { setRefreshCookie } from '@/lib/auth'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function POST(request: Request) {
  const body = await request.text()
  const res = await proxyFetch(request, '/api/auth/2fa/verify/', {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  }

  const data = await res.json()
  const response = NextResponse.json({ access: data.access })
  setRefreshCookie(response, data.refresh)
  return response
}
