'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, MapPin, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { City } from '@/features/locations/api'
import { type CityFormData, citySchema } from '@/features/locations/schemas'
import { useApi } from '@/hooks/use-api'

const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]

interface CityFormProps {
  initialData?: City | null
  onSuccess?: () => void
}

export function CityForm({ initialData, onSuccess }: CityFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { call } = useApi()
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CityFormData>({
    resolver: zodResolver(citySchema),
    defaultValues: initialData || { name: '', uf: '', ibge_code: '' },
  })

  const onInvalid = () => toast.error('Há campos obrigatórios não preenchidos')

  const saveCity = async (data: CityFormData) => {
    const url = initialData
      ? `/api/locations/cities/${initialData.id}`
      : '/api/locations/cities'
    const res = await call(url, {
      method: initialData ? 'PATCH' : 'POST',
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Erro ao salvar')
    }
  }

  const onSubmit = async (data: CityFormData) => {
    setIsSaving(true)
    try {
      await saveCity(data)
      toast.success('Salvo com sucesso!')
      await queryClient.invalidateQueries({ queryKey: ['cities'] })
      if (onSuccess) return onSuccess()
      router.push('/locations')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro desconhecido')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <MapPin className="size-6 text-muted-foreground" />
            {initialData ? 'Editar Cidade' : 'Nova Cidade'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl font-bold shadow-sm px-6"
            onClick={() => router.push('/locations')}
          >
            Cancelar
          </Button>

          <Button
            onClick={handleSubmit(onSubmit, onInvalid)}
            disabled={isSaving || !isDirty}
            className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold transition-all shadow-md px-6"
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
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex-1 min-w-[300px] space-y-1.5">
              <Label
                htmlFor="name"
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
              >
                Nome da Cidade *
              </Label>
              <Input
                id="name"
                {...register('name')}
                aria-invalid={!!errors.name}
                className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
              />
            </div>

            <div className="w-full md:w-[120px] space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                UF *
              </Label>
              <NativeSelect
                {...register('uf')}
                aria-invalid={!!errors.uf}
                className="border-muted-foreground/20 focus-visible:ring-primary/20 shadow-none"
              >
                <option value="" disabled>
                  UF
                </option>
                {BRAZILIAN_STATES.map(uf => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="w-full md:w-[200px] space-y-1.5">
              <Label
                htmlFor="ibge_code"
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
              >
                Código IBGE *
              </Label>
              <Input
                id="ibge_code"
                {...register('ibge_code')}
                aria-invalid={!!errors.ibge_code}
                className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
