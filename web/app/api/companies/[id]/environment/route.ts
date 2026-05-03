import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await proxyFetch(request, `/api/companies/${id}/environment/`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.text()
  const res = await proxyFetch(request, `/api/companies/${id}/environment/`, {
    method: 'PATCH',
    body,
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
