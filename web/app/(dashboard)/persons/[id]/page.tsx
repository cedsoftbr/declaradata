'use client'

import { Loader2 } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PersonForm } from '@/features/companies/components/client-form'
import { useApi } from '@/hooks/use-api'
import type { Person } from '@/lib/api'

function hydrateLegacyAddress(person: Person): Person {
  const defaultAddress =
    person.addresses?.find(a => a.is_active && a.is_default) ||
    person.addresses?.find(a => a.is_active) ||
    null

  if (!defaultAddress) return person

  return {
    ...person,
    contact_phone: defaultAddress.contact_phone,
    zip_code: defaultAddress.zip_code,
    address: defaultAddress.address,
    number: defaultAddress.number,
    complement: defaultAddress.complement,
    neighborhood: defaultAddress.neighborhood,
    city: defaultAddress.city,
  }
}

export default function EditPersonPage() {
  const { id } = useParams<{ id: string }>()
  const { call } = useApi()
  const [person, setPerson] = useState<Person | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    call(`/api/persons/${id}`)
      .then(res => res.json())
      .then((data: Person) => setPerson(hydrateLegacyAddress(data)))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [call, id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  if (notFound || !person) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-3">
        <p className="text-xl font-bold">Pessoa não encontrada</p>
        <p className="text-muted-foreground text-sm">
          O cadastro que você está tentando editar não existe.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PersonForm initialData={person} />
    </div>
  )
}
