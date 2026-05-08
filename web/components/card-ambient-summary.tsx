'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { shipmentsApi } from '@/features/shipments/api'
import { useAuth } from './providers/auth-provider'

type AmbientKey = 'producao' | 'homologacao'

const LABELS: Record<AmbientKey, string> = {
  producao: 'Emitentes em Produção',
  homologacao: 'Emitentes em Homologação',
}

interface Props {
  ambient: AmbientKey
  companyId?: string
}

export function CardAmbientSummary({ ambient, companyId }: Props) {
  const { user, getAccessToken, isAuthenticated, isInitializing } = useAuth()
  const [count, setCount] = React.useState<number | null>(null)
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
      .ambientSummary(token, companyId)
      .then(data => setCount(data[ambient].count))
      .catch(() => setCount(null))
  }, [isAuthenticated, isSuperAdmin, getAccessToken, companyId, ambient])

  if (!isMounted || isInitializing || !isAuthenticated || !isSuperAdmin) return null

  return (
    <Card className="rounded-2xl shadow-sm border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {LABELS[ambient]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-bold">{count ?? '—'}</p>
      </CardContent>
    </Card>
  )
}
