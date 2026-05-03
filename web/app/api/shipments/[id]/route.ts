import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

async function toJsonSafe(res: Response) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return {
      detail: text?.slice(0, 500) || 'Erro inesperado no backend.',
      status: res.status,
    }
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await proxyFetch(request, `/api/shipments/${id}/`)
  const data = await toJsonSafe(res)
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.text()
  const res = await proxyFetch(request, `/api/shipments/${id}/`, {
    method: 'PATCH',
    body,
  })
  const data = await toJsonSafe(res)
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await proxyFetch(request, `/api/shipments/${id}/`, {
    method: 'DELETE',
  })
  if (res.status === 204) return new Response(null, { status: 204 })
  const data = await toJsonSafe(res)
  return NextResponse.json(data, { status: res.status })
}
