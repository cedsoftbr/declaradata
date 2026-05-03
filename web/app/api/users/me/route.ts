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

export async function GET(request: Request) {
  const res = await proxyFetch(request, '/api/users/me/')
  const data = await toJsonSafe(res)
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(request: Request) {
  const body = await request.text()
  const res = await proxyFetch(request, '/api/users/me/', {
    method: 'PATCH',
    body,
  })
  const data = await toJsonSafe(res)
  return NextResponse.json(data, { status: res.status })
}
