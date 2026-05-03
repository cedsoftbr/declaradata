import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function POST(request: Request) {
  const body = await request.text()
  const res = await proxyFetch(request, '/api/auth/password/reset/', {
    method: 'POST',
    body,
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
