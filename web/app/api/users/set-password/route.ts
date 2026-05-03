import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function POST(request: Request) {
  const body = await request.text()
  const res = await proxyFetch(request, '/api/users/me/change-password/', {
    method: 'POST',
    body,
  })
  if (res.status === 204) return new Response(null, { status: 204 })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
