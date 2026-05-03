import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await proxyFetch(request, `/api/shipments/${id}/pdf/`)
  if (!res.ok) {
    const data = await res.json()
    return Response.json(data, { status: res.status })
  }
  const pdf = await res.arrayBuffer()
  const disposition =
    res.headers.get('Content-Disposition') ?? `attachment; filename="DCe_${id}.pdf"`
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
    },
  })
}
