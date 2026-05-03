import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await proxyFetch(request, `/api/companies/${id}/create-tenant/`, {
    method: 'POST',
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
