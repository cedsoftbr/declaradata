'use client'

import * as React from 'react'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { shipmentsApi } from '@/features/shipments/api'
import { useAuth } from './providers/auth-provider'

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--primary)',
]

const chartConfig = {
  count: { label: 'Declarações' },
} satisfies ChartConfig

const PERIOD_OPTIONS = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '60', label: 'Últimos 60 dias' },
  { value: '90', label: 'Últimos 90 dias' },
]

export function ChartTopEmitters() {
  const { user, getAccessToken, isAuthenticated, isInitializing } = useAuth()
  const [days, setDays] = React.useState('30')
  const [data, setData] = React.useState<{ company: string; count: number }[]>([])
  const [loading, setLoading] = React.useState(false)
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  const isSuperAdmin = user?.is_staff || user?.is_superuser

  React.useEffect(() => {
    if (!isAuthenticated || !isSuperAdmin) return
    const token = getAccessToken()
    if (!token) return

    setLoading(true)
    shipmentsApi
      .topEmitters(token, Number(days))
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [days, isAuthenticated, isSuperAdmin, getAccessToken])

  if (!isMounted || isInitializing || !isAuthenticated || !isSuperAdmin) return null

  return (
    <Card className="pt-0 shadow-sm border rounded-2xl h-full">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Top 6 Clientes</CardTitle>
          <CardDescription>Empresas com mais DCes autorizadas</CardDescription>
        </div>
        <CardAction>
          <Select value={days} onValueChange={v => v && setDays(v)}>
            <SelectTrigger className="w-[155px] rounded-lg" aria-label="Período">
              <SelectValue placeholder="" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {PERIOD_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="rounded-lg">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {loading ? (
          <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">
            Carregando...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">
            Nenhuma emissão no período.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="company"
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={110}
                tick={{ fontSize: 12 }}
                tickFormatter={v => (v.length > 16 ? `${v.slice(0, 14)}…` : v)}
              />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel indicator="dot" />}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((entry, i) => (
                  <Cell key={entry.company} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
