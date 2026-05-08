'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { invoicesApi } from '@/features/billing/api'
import { useAuth } from './providers/auth-provider'

type Metric = 'to_receive' | 'received'

const LABELS: Record<Metric, string> = {
  to_receive: 'A receber no mês',
  received: 'Recebido no mês',
}

function formatBRL(value: string) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

interface Props {
  metric: Metric
  companyId?: string
}

export function CardBillingSummary({ metric, companyId }: Props) {
  const { user, getAccessToken, isAuthenticated, isInitializing } = useAuth()
  const [data, setData] = React.useState<{ to_receive: string; received: string } | null>(null)
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  const isSuperAdmin = user?.is_staff || user?.is_superuser

  React.useEffect(() => {
    if (!isAuthenticated || !isSuperAdmin) return
    const token = getAccessToken()
    if (!token) return
    invoicesApi
      .monthlySummary(token, companyId)
      .then(setData)
      .catch(() => setData(null))
  }, [isAuthenticated, isSuperAdmin, getAccessToken, companyId])

  if (!isMounted || isInitializing || !isAuthenticated || !isSuperAdmin) return null

  return (
    <Card className="rounded-2xl shadow-sm border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {LABELS[metric]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">
          {data ? formatBRL(data[metric]) : '—'}
        </p>
      </CardContent>
    </Card>
  )
}
