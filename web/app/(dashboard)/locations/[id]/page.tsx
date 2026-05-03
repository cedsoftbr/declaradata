'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'
import type { City } from '@/features/locations/api'
import { CityForm } from '@/features/locations/components/city-form'
import { useApi } from '@/hooks/use-api'

export default function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { call } = useApi()
  const [city, setCity] = useState<City | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await call(`/api/locations/cities/${id}`)
        if (res.ok) {
          const data = (await res.json()) as City
          setCity(data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [call, id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
      </div>
    )
  }

  if (!city) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Cidade não encontrada.
      </div>
    )
  }

  return (
    <CityForm
      initialData={city}
      onSuccess={() => {
        router.push('/locations')
        router.refresh()
      }}
    />
  )
}
