'use client'

import { useRouter } from 'next/navigation'
import { CityForm } from '@/features/locations/components/city-form'

export default function NewLocationPage() {
  const router = useRouter()

  return (
    <CityForm
      onSuccess={() => {
        router.push('/locations')
        router.refresh()
      }}
    />
  )
}
