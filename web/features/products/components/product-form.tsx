'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Package, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ncmCatalogApi } from '@/features/ncm-catalog/api'
import {
  type ProductFormData,
  type ProductFormInput,
  productSchema,
} from '@/features/products/schemas'
import { useApi } from '@/hooks/use-api'
import type { Product } from '@/lib/api'
import { formatNcm, normalizeNcm } from '@/lib/document'

interface ProductFormProps {
  initialData?: Product | null
  onSuccess?: () => void
}

export function ProductForm({ initialData, onSuccess }: ProductFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { call } = useApi()
  const { accessToken: token } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [ncmNotCataloged, setNcmNotCataloged] = useState<boolean | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProductFormInput, unknown, ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: initialData
      ? {
          descricao: initialData.descricao,
          ncm: formatNcm(initialData.ncm),
          unit_value: (initialData.unit_value ?? '') as ProductFormInput['unit_value'],
        }
      : {
          descricao: '',
          ncm: '',
          unit_value: '',
        },
  })
  const checkNcmCatalog = async (value: string) => {
    const digits = normalizeNcm(value)
    if (digits.length !== 8 || !token) {
      setNcmNotCataloged(null)
      return
    }
    try {
      const res = await ncmCatalogApi.check(token, digits)
      setNcmNotCataloged(res.count === 0)
    } catch {
      setNcmNotCataloged(null)
    }
  }

  const ncmField = register('ncm', {
    onChange: e => {
      e.target.value = formatNcm(e.target.value)
      const digits = normalizeNcm(e.target.value)
      if (digits.length === 8) {
        checkNcmCatalog(e.target.value)
      } else {
        setNcmNotCataloged(null)
      }
    },
  })

  const onInvalid = () => {
    toast.error('Não foi possível salvar', {
      description:
        'Existem campos obrigatórios ou inválidos que precisam de sua atenção.',
    })
  }

  const onSubmit = async (data: ProductFormData) => {
    setIsSaving(true)
    try {
      const isEdit = !!initialData
      const url = isEdit ? `/api/products/${initialData.id}/` : '/api/products/'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await call(url, {
        method,
        body: JSON.stringify({
          ...data,
          unit_value: data.unit_value === '' ? null : data.unit_value,
        }),
      })

      if (!res.ok) {
        throw new Error('Erro ao salvar produto')
      }

      toast.success(isEdit ? 'Produto atualizado!' : 'Produto criado!')

      await queryClient.invalidateQueries({ queryKey: ['products'] })
      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/products')
      }
    } catch (_error) {
      toast.error('Erro ao salvar produto. Verifique os dados.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Package className="size-6 text-muted-foreground" />
            {initialData ? 'Editar Produto' : 'Novo Produto'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl font-bold shadow-sm px-6"
            onClick={() => router.push('/products')}
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
                htmlFor="descricao"
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
              >
                Descrição *
              </Label>
              <Input
                id="descricao"
                {...register('descricao')}
                aria-invalid={!!errors.descricao}
                className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
              />
              {errors.descricao && (
                <p className="text-[10px] text-destructive font-medium ml-1">
                  {errors.descricao.message || 'Campo obrigatório'}
                </p>
              )}
            </div>

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
                className={`h-10 rounded-xl ${
                  ncmNotCataloged
                    ? 'border-amber-400 ring-3 ring-amber-400/30 focus-visible:ring-amber-400/30'
                    : 'border-muted-foreground/20 focus-visible:ring-primary/20'
                }`}
              />
              {errors.ncm && (
                <p className="text-[10px] text-destructive font-medium ml-1">
                  {errors.ncm.message || 'NCM deve ter 8 dígitos'}
                </p>
              )}
              {ncmNotCataloged && !errors.ncm && (
                <p className="text-[10px] text-amber-500 font-medium ml-1">
                  NCM não catalogado
                </p>
              )}
            </div>

            <div className="w-full md:w-[200px] space-y-1.5">
              <Label
                htmlFor="unit_value"
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
              >
                Valor Unitário (R$)
              </Label>
              <Input
                id="unit_value"
                type="number"
                step="0.0001"
                min="0"
                {...register('unit_value')}
                aria-invalid={!!errors.unit_value}
                className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
              />
              {errors.unit_value && (
                <p className="text-[10px] text-destructive font-medium ml-1">
                  {errors.unit_value.message}
                </p>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
