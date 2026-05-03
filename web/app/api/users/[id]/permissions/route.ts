import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await proxyFetch(request, `/api/users/${id}/permissions/`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.text()
  const res = await proxyFetch(request, `/api/users/${id}/permissions/`, {
    method: 'PUT',
    body,
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
