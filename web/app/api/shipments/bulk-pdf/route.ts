import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ids = searchParams.get('ids')
  const token = searchParams.get('token')

  const query = new URLSearchParams()
  if (ids) query.set('ids', ids)
  if (token) query.set('token', token)

  const res = await proxyFetch(request, `/api/shipments/bulk-pdf/?${query.toString()}`)

  if (!res.ok) {
    try {
      const data = await res.json()
      return Response.json(data, { status: res.status })
    } catch {
      return Response.json(
        { detail: 'Erro ao gerar PDF em lote.' },
        { status: res.status }
      )
    }
  }

  const pdf = await res.arrayBuffer()
  const disposition =
    res.headers.get('Content-Disposition') ?? 'inline; filename="DCE_Lote.pdf"'

  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
    },
  })
}

export async function POST(request: Request) {
  const body = await request.text()
  const res = await proxyFetch(request, '/api/shipments/bulk-pdf/', {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    try {
      const data = await res.json()
      return Response.json(data, { status: res.status })
    } catch {
      return Response.json(
        { detail: 'Erro ao processar PDF em lote.' },
        { status: res.status }
      )
    }
  }

  const pdf = await res.arrayBuffer()
  const disposition =
    res.headers.get('Content-Disposition') ?? 'inline; filename="DCE_Lote.pdf"'

  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
    },
  })
}
