import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function POST(request: Request) {
  const res = await proxyFetch(request, '/api/billing/invoices/generate/', {
    method: 'POST',
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
