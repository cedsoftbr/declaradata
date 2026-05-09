import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()
  const res = await proxyFetch(
    request,
    `/api/shipments/bulk-pdf/download/${query ? `?${query}` : ''}`
  )

  if (!res.ok) {
    try {
      const data = await res.json()
      return Response.json(data, { status: res.status })
    } catch {
      return Response.json({ detail: 'Erro ao baixar PDF.' }, { status: res.status })
    }
  }

  const file = await res.arrayBuffer()
  const disposition =
    res.headers.get('Content-Disposition') ?? 'attachment; filename="dce_impressao.pdf"'

  return new Response(file, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
    },
  })
}
