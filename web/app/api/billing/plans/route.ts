import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  const res = await proxyFetch(request, `/api/billing/plans/${qs ? `?${qs}` : ''}`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(request: Request) {
  const body = await request.text()
  const res = await proxyFetch(request, '/api/billing/plans/', { method: 'POST', body })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
