'use client'

import * as React from 'react'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAuth } from './providers/auth-provider'

const chartData = [
  { date: '2023-07-01', faturamento: 3200, churn: 300 },
  { date: '2023-08-01', faturamento: 3500, churn: 400 },
  { date: '2023-09-01', faturamento: 3400, churn: 200 },
  { date: '2023-10-01', faturamento: 3800, churn: 500 },
  { date: '2023-11-01', faturamento: 4100, churn: 300 },
  { date: '2023-12-01', faturamento: 4500, churn: 600 },
  { date: '2024-01-01', faturamento: 4800, churn: 400 },
  { date: '2024-02-01', faturamento: 5200, churn: 350 },
  { date: '2024-03-01', faturamento: 5600, churn: 300 },
  { date: '2024-04-01', faturamento: 6100, churn: 450 },
  { date: '2024-05-01', faturamento: 7300, churn: 550 },
  { date: '2024-06-01', faturamento: 8900, churn: 500 },
]

const chartConfig = {
  faturamento: {
    label: 'Faturamento',
    color: 'var(--foreground)',
  },
  churn: {
    label: 'Perda (Churn)',
    color: 'var(--muted-foreground)',
  },
} satisfies ChartConfig

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const { isAuthenticated, isInitializing } = useAuth()
  const [timeRange, setTimeRange] = React.useState('6m')
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
    if (isMobile) setTimeRange('3m')
  }, [isMobile])

  const filteredData = React.useMemo(() => {
    return chartData.filter(item => {
      const date = new Date(item.date)
      const referenceDate = new Date('2024-06-30')
      let monthsToSubtract = 6
      if (timeRange === '3m') monthsToSubtract = 3
      else if (timeRange === '12m') monthsToSubtract = 12
      const startDate = new Date(referenceDate)
      startDate.setMonth(startDate.getMonth() - monthsToSubtract)
      return date >= startDate
    })
  }, [timeRange])

  if (!isMounted || isInitializing || !isAuthenticated) return null

  return (
    <Card className="pt-0 shadow-sm border rounded-2xl">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Desempenho Comercial</CardTitle>
          <CardDescription>Faturamento e perda de receita por churn</CardDescription>
        </div>
        <CardAction>
          <ToggleGroup
            multiple={false}
            value={timeRange ? [timeRange] : []}
            onValueChange={value => {
              if (value.length > 0) setTimeRange(value[0])
            }}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex rounded-xl overflow-hidden border-muted-foreground/20"
          >
            <ToggleGroupItem value="3m">3 meses</ToggleGroupItem>
            <ToggleGroupItem value="6m">6 meses</ToggleGroupItem>
            <ToggleGroupItem value="12m">12 meses</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={timeRange}
            onValueChange={v => {
              if (v) setTimeRange(v)
            }}
          >
            <SelectTrigger
              className="hidden w-[160px] rounded-lg sm:ml-auto sm:flex"
              aria-label="Selecionar período"
            >
              <SelectValue placeholder="" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="3m" className="rounded-lg">
                Últimos 3 meses
              </SelectItem>
              <SelectItem value="6m" className="rounded-lg">
                Últimos 6 meses
              </SelectItem>
              <SelectItem value="12m" className="rounded-lg">
                Últimos 12 meses
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[400px] w-full">
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillFaturamento" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-faturamento)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-faturamento)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillChurn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-churn)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-churn)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={value => {
                const date = new Date(value)
                return date.toLocaleDateString('pt-BR', {
                  month: 'short',
                  year: '2-digit',
                })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={value =>
                    new Date(value).toLocaleDateString('pt-BR', {
                      month: 'long',
                      year: 'numeric',
                    })
                  }
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="churn"
              type="natural"
              fill="url(#fillChurn)"
              stroke="var(--color-churn)"
              stackId="a"
            />
            <Area
              dataKey="faturamento"
              type="natural"
              fill="url(#fillFaturamento)"
              stroke="var(--color-faturamento)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
