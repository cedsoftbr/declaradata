import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.text()
  const res = await proxyFetch(request, `/api/shipments/${id}/cancel/`, {
    method: 'POST',
    body,
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
