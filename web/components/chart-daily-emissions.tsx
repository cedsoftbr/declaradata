'use client'

import * as React from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
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

const chartConfig = {
  count: {
    label: 'DCes',
    color: 'var(--foreground)',
  },
} satisfies ChartConfig

const PERIOD_OPTIONS = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '60', label: 'Últimos 60 dias' },
  { value: '90', label: 'Últimos 90 dias' },
]

function fillDailyGaps(
  data: { date: string; count: number }[],
  days: number
): { date: string; count: number }[] {
  const map = new Map(data.map(d => [d.date, d.count]))
  const result: { date: string; count: number }[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    result.push({ date: key, count: map.get(key) ?? 0 })
  }
  return result
}

function average(data: { count: number }[]) {
  if (!data.length) return 0
  return Math.round(data.reduce((s, d) => s + d.count, 0) / data.length)
}

export function ChartDailyEmissions() {
  const { user, getAccessToken, isAuthenticated, isInitializing } = useAuth()
  const [days, setDays] = React.useState('30')
  const [chartData, setChartData] = React.useState<{ date: string; count: number }[]>(
    []
  )
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
      .dailyEmissions(token, Number(days))
      .then(data => setChartData(fillDailyGaps(data, Number(days))))
      .catch(() => setChartData([]))
      .finally(() => setLoading(false))
  }, [days, isAuthenticated, isSuperAdmin, getAccessToken])

  if (!isMounted || isInitializing || !isAuthenticated || !isSuperAdmin) return null

  const avg = average(chartData)

  return (
    <Card className="pt-0 shadow-sm border rounded-2xl">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Emissões de DCe — Todas as Empresas</CardTitle>
          <CardDescription>
            Declarações autorizadas por dia · média {avg}/dia
          </CardDescription>
        </div>
        <CardAction>
          <Select value={days} onValueChange={v => v && setDays(v)}>
            <SelectTrigger className="w-[170px] rounded-lg" aria-label="Período">
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
          <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
            Carregando...
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
            <LineChart data={chartData} margin={{ top: 8, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tickFormatter={value => {
                  const date = new Date(`${value}T12:00:00`)
                  return date.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                  })
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                allowDecimals={false}
                width={28}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={value => {
                      const date = new Date(`${value}T12:00:00`)
                      return date.toLocaleDateString('pt-BR', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'long',
                      })
                    }}
                    indicator="line"
                  />
                }
              />
              {avg > 0 && (
                <ReferenceLine
                  y={avg}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: `média ${avg}`,
                    position: 'insideTopRight',
                    fontSize: 11,
                    fill: 'var(--muted-foreground)',
                  }}
                />
              )}
              <Line
                dataKey="count"
                type="natural"
                stroke="var(--color-count)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--color-count)' }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
