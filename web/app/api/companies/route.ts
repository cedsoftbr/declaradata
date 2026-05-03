import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  const res = await proxyFetch(request, `/api/companies/${qs ? `?${qs}` : ''}`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(request: Request) {
  const body = await request.text()
  const res = await proxyFetch(request, '/api/companies/', {
    method: 'POST',
    body,
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id: number } & Record<string, unknown>
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'ID não fornecido.' }, { status: 400 })
  const res = await proxyFetch(request, `/api/companies/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(rest),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID não fornecido.' }, { status: 400 })
  const res = await proxyFetch(request, `/api/companies/${id}/`, {
    method: 'DELETE',
  })
  if (res.status === 204) return new Response(null, { status: 204 })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
