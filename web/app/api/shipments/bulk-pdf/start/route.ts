import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

async function toJsonSafe(res: Response) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { detail: text?.slice(0, 500) || 'Erro inesperado no backend.' }
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()
  const res = await proxyFetch(
    request,
    `/api/shipments/bulk-pdf/start/${query ? `?${query}` : ''}`,
    { method: 'POST' }
  )
  const data = await toJsonSafe(res)
  return NextResponse.json(data, { status: res.status })
}
