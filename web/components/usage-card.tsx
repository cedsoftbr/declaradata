'use client'

import { useQuery } from '@tanstack/react-query'
import { Progress } from '@/components/ui/progress'
import { useApi } from '@/hooks/use-api'
import { cn } from '@/lib/utils'

export function UsageCard() {
  const { call } = useApi()

  const { data, isLoading } = useQuery({
    queryKey: ['shipments-usage'],
    queryFn: async () => {
      const res = await call('/api/shipments/usage/')
      if (!res.ok) return null
      return res.json() as Promise<{ count: number; limit: number; period: string }>
    },
    staleTime: 25000,
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return (
      <div className="mx-2 px-4 py-4 rounded-xl border bg-card/50 flex flex-col gap-2">
        <div className="h-3 w-24 bg-muted animate-pulse rounded" />
        <div className="h-3 w-32 bg-muted animate-pulse rounded" />
        <div className="h-1.5 w-full bg-muted animate-pulse rounded" />
      </div>
    )
  }

  if (!data) return null

  const percentage = Math.min(Math.round((data.count / data.limit) * 100), 100)
  const isNearLimit = percentage >= 80
  const isFull = percentage >= 100

  return (
    <div className="mx-2 px-4 py-4 rounded-xl border bg-card shadow-sm space-y-2.5 transition-all border-muted-foreground/10">
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground">Consumo do mês</p>
        <p className="text-xs font-medium text-foreground">
          {data.count} de {data.limit} declarações
        </p>
      </div>

      <Progress
        value={percentage}
        className="h-1.5 bg-muted rounded-full overflow-hidden"
        indicatorClassName={cn(
          'transition-all duration-500',
          isFull ? 'bg-destructive' : isNearLimit ? 'bg-orange-500' : 'bg-primary'
        )}
      />

      {isFull && (
        <p className="text-[10px] font-medium text-destructive leading-tight text-center">
          Limite atingido
        </p>
      )}
    </div>
  )
}
