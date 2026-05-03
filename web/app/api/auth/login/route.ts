import { NextResponse } from 'next/server'
import { setRefreshCookie } from '@/lib/auth'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function POST(request: Request) {
  const body = await request.text()
  const res = await proxyFetch(request, '/api/auth/login/', {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  }

  const data = await res.json()

  if (data.requires_2fa) {
    return NextResponse.json({ requires_2fa: true, session_token: data.session_token })
  }

  const access = data.access ?? data.access_token
  const refresh = data.refresh ?? data.refresh_token

  const response = NextResponse.json({ access })
  if (refresh) {
    setRefreshCookie(response, refresh)
  }
  return response
}
