'use client'

import { Loader2 } from 'lucide-react'
import { use, useEffect, useState } from 'react'
import { CompanyForm } from '@/features/companies/components/company-form'
import { useApi } from '@/hooks/use-api'
import type { Company } from '@/lib/api'

export default function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { call } = useApi()
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await call(`/api/companies/${id}/`)
        if (!res.ok) {
          setCompany(null)
          return
        }
        const data: Company = await res.json()
        setCompany(data)
      } catch (err) {
        console.error(err)
        setCompany(null)
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

  if (!company) {
    return <div>Empresa não encontrada.</div>
  }

  return <CompanyForm initialData={company} />
}
