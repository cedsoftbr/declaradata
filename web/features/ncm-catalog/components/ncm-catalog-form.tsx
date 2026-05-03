'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Tags } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApi } from '@/hooks/use-api'
import { formatNcm, normalizeNcm } from '@/lib/document'

const ncmCatalogSchema = z.object({
  ncm: z
    .string()
    .transform(normalizeNcm)
    .refine(v => v.length === 8, 'NCM deve ter exatamente 8 dígitos')
    .refine(v => /^\d{8}$/.test(v), 'NCM deve conter apenas dígitos'),
})

type NcmCatalogFormData = z.infer<typeof ncmCatalogSchema>

export function NcmCatalogForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { call } = useApi()
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<NcmCatalogFormData>({
    resolver: zodResolver(ncmCatalogSchema),
    defaultValues: { ncm: '' },
  })

  const ncmField = register('ncm', {
    onChange: e => {
      e.target.value = formatNcm(e.target.value)
    },
  })

  const onInvalid = () => {
    toast.error('Não foi possível salvar', {
      description:
        'Existem campos obrigatórios ou inválidos que precisam de sua atenção.',
    })
  }

  const onSubmit = async (data: NcmCatalogFormData) => {
    setIsSaving(true)
    try {
      const res = await call('/api/products/catalog/', {
        method: 'POST',
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = err?.ncm?.[0] || err?.detail || 'Erro ao salvar NCM'
        throw new Error(msg)
      }

      toast.success('NCM cadastrado no catálogo!')
      await queryClient.invalidateQueries({ queryKey: ['ncm-catalog'] })
      router.push('/catalog')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar NCM.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Tags className="size-6 text-muted-foreground" />
            Novo NCM
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl font-bold shadow-sm px-6"
            onClick={() => router.push('/catalog')}
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
          <div className="w-full md:w-[200px] space-y-1.5">
            <Label
              htmlFor="ncm"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              NCM *
            </Label>
            <Input
              id="ncm"
              {...ncmField}
              aria-invalid={!!errors.ncm}
              maxLength={10}
              placeholder="0000.00.00"
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.ncm && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.ncm.message || 'NCM deve ter 8 dígitos'}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
