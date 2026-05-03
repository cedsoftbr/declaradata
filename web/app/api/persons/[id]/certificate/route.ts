import { NextResponse } from 'next/server'
import { backendFetch } from '@/lib/proxy-fetch'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.headers.get('Authorization') ?? ''

  const formData = await request.formData()

  const res = await backendFetch(`/api/persons/${id}/certificate/`, {
    method: 'POST',
    headers: {
      Authorization: token,
    },
    body: formData,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    return NextResponse.json(error, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.headers.get('Authorization') ?? ''

  const res = await backendFetch(`/api/persons/${id}/certificate/`, {
    method: 'DELETE',
    headers: {
      Authorization: token,
    },
  })

  if (res.status === 204) return new Response(null, { status: 204 })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
