'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { DceForm } from '@/features/shipments/components/dce-form'
import { shipmentsApi } from '@/lib/api'

export default function NovoDcePage() {
  const searchParams = useSearchParams()
  const from = searchParams.get('from')
  const { accessToken: token } = useAuth()

  const { data: source, isLoading } = useQuery({
    queryKey: ['shipment', from],
    queryFn: () => shipmentsApi.get(token || '', from ?? ''),
    enabled: !!token && !!from,
  })

  if (from && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const initialData = source ? { ...source, id: '', number: null } : undefined

  return <DceForm initialData={initialData} />
}
