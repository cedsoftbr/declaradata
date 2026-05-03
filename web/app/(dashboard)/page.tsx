'use client'

import { DollarSign } from 'lucide-react'
import { ChartDailyEmissions } from '@/components/chart-daily-emissions'
import { ChartTopEmitters } from '@/components/chart-top-emitters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Grid 4 colunas: gráfico ocupa col-span-2 row-span-2 (últimos 2 da linha 1 + 2 da linha 2) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
        <Card className="rounded-2xl shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Indicador 1
            </CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-muted-foreground mt-1">Pendente</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Indicador 2
            </CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-muted-foreground mt-1">Pendente</p>
          </CardContent>
        </Card>

        {/* Top Emitters: ocupa as últimas 2 colunas × 2 linhas */}
        <div className="md:col-span-2 lg:col-span-2 lg:row-span-2">
          <ChartTopEmitters />
        </div>

        <Card className="rounded-2xl shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Indicador 3
            </CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-muted-foreground mt-1">Pendente</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Indicador 4
            </CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-xs text-muted-foreground mt-1">Pendente</p>
          </CardContent>
        </Card>
      </div>

      <ChartDailyEmissions />
    </div>
  )
}
