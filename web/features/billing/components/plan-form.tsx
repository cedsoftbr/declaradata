'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, Loader2, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { type PlanFormData, planSchema } from '@/features/billing/schemas'
import { useApi } from '@/hooks/use-api'
import type { Plan } from '../api'

interface PlanFormProps {
  initialData?: Plan | null
}

export function PlanForm({ initialData }: PlanFormProps) {
  const router = useRouter()
  const { call } = useApi()
  const queryClient = useQueryClient()
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          monthly_dce_limit: initialData.monthly_dce_limit,
          active_user_limit: initialData.active_user_limit,
          price: initialData.price,
          is_active: initialData.is_active,
        }
      : {
          name: '',
          monthly_dce_limit: 100,
          active_user_limit: 5,
          price: '0.00',
          is_active: true,
        },
  })

  const onSubmit = async (data: PlanFormData) => {
    setIsSaving(true)
    try {
      const method = initialData ? 'PATCH' : 'POST'
      const url = initialData
        ? `/api/billing/plans/${initialData.id}/`
        : '/api/billing/plans/'
      const res = await call(url, { method, body: JSON.stringify(data) })
      if (!res.ok) throw new Error()
      await queryClient.invalidateQueries({ queryKey: ['plans'] })
      router.push('/billing/plans')
    } catch {
      toast.error('Erro ao salvar plano.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <CreditCard className="size-6 text-muted-foreground" />
          {initialData ? 'Editar Plano' : 'Novo Plano'}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl font-bold shadow-sm px-6"
            onClick={() => router.push('/billing/plans')}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={isSaving || !isDirty}
            className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md px-6"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-6">
          {initialData && (
            <div className="flex items-center justify-between cursor-pointer select-none rounded-xl border px-4 py-3 hover:bg-muted/40 transition-colors w-full">
              <span className="text-sm font-medium">Plano ativo</span>
              <Switch
                checked={watch('is_active')}
                onCheckedChange={checked =>
                  setValue('is_active', checked, { shouldDirty: true })
                }
              />
            </div>
          )}

          <div className="flex-1 min-w-[240px] space-y-1.5">
            <Label
              htmlFor="name"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Nome *
            </Label>
            <Input
              id="name"
              {...register('name')}
              aria-invalid={!!errors.name}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.name && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="w-full md:w-[180px] space-y-1.5">
            <Label
              htmlFor="price"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Preço mensal (R$) *
            </Label>
            <Input
              id="price"
              inputMode="decimal"
              {...register('price')}
              aria-invalid={!!errors.price}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.price && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.price.message}
              </p>
            )}
          </div>

          <div className="w-full border-t border-muted-foreground/10" />

          <div className="w-full md:w-[220px] space-y-1.5">
            <Label
              htmlFor="monthly_dce_limit"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Limite mensal de DC-e *
            </Label>
            <Input
              id="monthly_dce_limit"
              type="number"
              min={1}
              step={1}
              {...register('monthly_dce_limit')}
              aria-invalid={!!errors.monthly_dce_limit}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.monthly_dce_limit && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.monthly_dce_limit.message}
              </p>
            )}
          </div>

          <div className="w-full md:w-[220px] space-y-1.5">
            <Label
              htmlFor="active_user_limit"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Limite de usuários ativos *
            </Label>
            <Input
              id="active_user_limit"
              type="number"
              min={1}
              step={1}
              {...register('active_user_limit')}
              aria-invalid={!!errors.active_user_limit}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.active_user_limit && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.active_user_limit.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
