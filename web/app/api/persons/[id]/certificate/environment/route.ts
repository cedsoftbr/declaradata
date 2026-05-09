import { NextResponse } from 'next/server'
import { backendFetch } from '@/lib/proxy-fetch'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.headers.get('Authorization') ?? ''
  const body = await request.text()

  const res = await backendFetch(`/api/persons/${id}/certificate/environment/`, {
    method: 'PATCH',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body,
  })

  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
