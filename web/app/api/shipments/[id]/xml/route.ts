import { proxyFetch } from '@/lib/proxy-fetch'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const res = await proxyFetch(request, `/api/shipments/${id}/xml/`)
  if (!res.ok) {
    const data = await res.json()
    return Response.json(data, { status: res.status })
  }
  const xml = await res.text()
  const filename =
    res.headers.get('Content-Disposition') ?? `attachment; filename="DCe_${id}.xml"`
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Content-Disposition': filename,
    },
  })
}
