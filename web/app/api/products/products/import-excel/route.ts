import { NextResponse } from 'next/server'
import { backendFetch } from '@/lib/proxy-fetch'

export async function POST(request: Request) {
  const token = request.headers.get('Authorization') ?? ''
  const formData = await request.formData()

  const res = await backendFetch('/api/products/import-excel/', {
    method: 'POST',
    headers: {
      Authorization: token,
    },
    body: formData,
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
