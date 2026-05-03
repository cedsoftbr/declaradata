import { NextResponse } from 'next/server'
import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await proxyFetch(request, `/api/persons/${id}/certificate/status/`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
