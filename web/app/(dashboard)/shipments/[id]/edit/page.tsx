'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { DceForm } from '@/features/shipments/components/dce-form'
import { shipmentsApi } from '@/lib/api'

export default function EditShipmentPage() {
  const params = useParams()
  const id = params.id as string
  const { accessToken: token } = useAuth()

  const {
    data: shipment,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['shipment', id],
    queryFn: () => shipmentsApi.get(token || '', id),
    enabled: !!token && !!id,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !shipment) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Erro ao carregar os dados da remessa.
      </div>
    )
  }

  if (shipment.status !== 'draft' && shipment.status !== 'rejected') {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Apenas remessas em emissão ou rejeitadas podem ser editadas.
      </div>
    )
  }

  return <DceForm key={shipment.id + shipment.updated_at} initialData={shipment} />
}
