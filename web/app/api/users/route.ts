import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const isAdmin = searchParams.get('admin') === 'true'
  const path = isAdmin ? '/api/admin/' : '/api/users/'
  const res = await proxyFetch(request, path)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const isAdmin = searchParams.get('admin') === 'true'
  const path = isAdmin ? '/api/admin/' : '/api/users/'
  const body = await request.text()
  const res = await proxyFetch(request, path, { method: 'POST', body })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url)
  const isAdmin = searchParams.get('admin') === 'true'
  const body = (await request.json()) as { id: number } & Record<string, unknown>
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'ID não fornecido.' }, { status: 400 })
  const path = isAdmin ? `/api/admin/${id}/` : `/api/users/${id}/`
  const res = await proxyFetch(request, path, {
    method: 'PATCH',
    body: JSON.stringify(rest),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const isAdmin = searchParams.get('admin') === 'true'
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID não fornecido.' }, { status: 400 })
  const path = isAdmin ? `/api/admin/${id}/` : `/api/users/${id}/`
  const res = await proxyFetch(request, path, { method: 'DELETE' })
  if (res.status === 204) return new Response(null, { status: 204 })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
