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
  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  const res = await proxyFetch(request, `/api/shipments/series/${qs ? `?${qs}` : ''}`)
  const data = await toJsonSafe(res)
  return NextResponse.json(data, { status: res.status })
}

export async function POST(request: Request) {
  const body = await request.text()
  const res = await proxyFetch(request, '/api/shipments/series/', {
    method: 'POST',
    body,
  })
  const data = await toJsonSafe(res)
  return NextResponse.json(data, { status: res.status })
}
