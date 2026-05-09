import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(request: Request) {
  const res = await proxyFetch(request, '/api/shipments/dashboard/top-emitters/')
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
