'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { use } from 'react'
import type { Plan } from '@/features/billing/api'
import { PlanForm } from '@/features/billing/components/plan-form'
import { useApi } from '@/hooks/use-api'

export default function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { call } = useApi()

  const { data: plan, isLoading } = useQuery({
    queryKey: ['plans', id],
    queryFn: async () => {
      const res = await call(`/api/billing/plans/${id}/`)
      if (!res.ok) throw new Error()
      return res.json() as Promise<Plan>
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 text-muted-foreground animate-spin" />
      </div>
    )
  }

  return <PlanForm initialData={plan} />
}
