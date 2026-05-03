import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await proxyFetch(request, `/api/locations/cities/${id}/`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.text()
  const res = await proxyFetch(request, `/api/locations/cities/${id}/`, {
    method: 'PATCH',
    body,
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await proxyFetch(request, `/api/locations/cities/${id}/`, {
    method: 'DELETE',
  })
  if (res.status === 204) return new Response(null, { status: 204 })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
