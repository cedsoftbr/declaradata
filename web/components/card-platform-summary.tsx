'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { shipmentsApi } from '@/features/shipments/api'
import { useAuth } from './providers/auth-provider'

type Metric = 'active_companies' | 'active_users'

const LABELS: Record<Metric, string> = {
  active_companies: 'Empresas ativas',
  active_users: 'Usuários ativos',
}

interface Props {
  metric: Metric
  companyId?: string
}

export function CardPlatformSummary({ metric, companyId }: Props) {
  const { user, getAccessToken, isAuthenticated, isInitializing } = useAuth()
  const [value, setValue] = React.useState<number | null>(null)
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  const isSuperAdmin = user?.is_staff || user?.is_superuser

  React.useEffect(() => {
    if (!isAuthenticated || !isSuperAdmin) return
    const token = getAccessToken()
    if (!token) return
    shipmentsApi
      .platformSummary(token, companyId)
      .then(data => setValue(data[metric]))
      .catch(() => setValue(null))
  }, [isAuthenticated, isSuperAdmin, getAccessToken, metric, companyId])

  if (!isMounted || isInitializing || !isAuthenticated || !isSuperAdmin) return null

  return (
    <Card className="rounded-2xl shadow-sm border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {LABELS[metric]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-bold">{value ?? '—'}</p>
      </CardContent>
    </Card>
  )
}
