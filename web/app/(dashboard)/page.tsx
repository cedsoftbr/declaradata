'use client'

import * as React from 'react'
import { ChartDailyEmissions } from '@/components/chart-daily-emissions'
import { ChartTopEmitters } from '@/components/chart-top-emitters'
import { CardAmbientSummary } from '@/components/card-ambient-summary'
import { CardPlatformSummary } from '@/components/card-platform-summary'
import { CardBillingSummary } from '@/components/card-billing-summary'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { companiesApi, type Company } from '@/features/companies/api'
import { useAuth } from '@/components/providers/auth-provider'

export default function DashboardPage() {
  const { getAccessToken, isAuthenticated } = useAuth()
  const [companies, setCompanies] = React.useState<Company[]>([])
  const [companyId, setCompanyId] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    if (!isAuthenticated) return
    const token = getAccessToken()
    if (!token) return
    companiesApi
      .list(token)
      .then(data => setCompanies(data.results))
      .catch(() => setCompanies([]))
  }, [isAuthenticated, getAccessToken])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <NativeSelect
          value={companyId ?? ''}
          onChange={e => setCompanyId(e.target.value || undefined)}
          wrapperClassName="w-[260px]"
        >
          <NativeSelectOption value="">Todas as empresas</NativeSelectOption>
          {companies.map(c => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.trade_name || c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-4 lg:grid-cols-5 lg:grid-rows-2">
        {/* Linha 1: 3 cards */}
        <div className="lg:col-span-3 grid gap-4 grid-cols-1 sm:grid-cols-3">
          <CardAmbientSummary ambient="producao" companyId={companyId} />
          <CardAmbientSummary ambient="homologacao" companyId={companyId} />
          <CardPlatformSummary metric="active_companies" companyId={companyId} />
        </div>

        {/* Top Emitters: ocupa 2 colunas × 2 linhas */}
        <div className="lg:col-span-2 lg:row-span-2">
          <ChartTopEmitters />
        </div>

        {/* Linha 2: 3 cards */}
        <div className="lg:col-span-3 grid gap-4 grid-cols-1 sm:grid-cols-3">
          <CardPlatformSummary metric="active_users" companyId={companyId} />
          <CardBillingSummary metric="to_receive" companyId={companyId} />
          <CardBillingSummary metric="received" companyId={companyId} />
        </div>
      </div>

      <ChartDailyEmissions />
    </div>
  )
}
