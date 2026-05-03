'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { type CompanyFormData, companySchema } from '@/features/companies/schemas'
import { useApi } from '@/hooks/use-api'
import { useCepAutoFill } from '@/hooks/use-cep-autofill'
import type { Company } from '@/lib/api'
import { UF_LIST } from '@/lib/constants'
import { formatCpfOrCnpj, isValidCpfOrCnpj, normalizeDocument } from '@/lib/document'
import { cepKeyDown, cleanCep, cleanPhone, formatCep, formatPhone } from '@/lib/utils'

interface CompanyFormProps {
  initialData?: Company | null
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dense form logic with business rules
export function CompanyForm({ initialData }: CompanyFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { call } = useApi()
  const { user } = useAuth()
  const _isSuperAdmin = user?.is_superuser === true
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          trade_name: initialData.trade_name ?? '',
          cnpj: initialData.cnpj,
          zip_code: initialData.zip_code ?? '',
          address: initialData.address ?? '',
          number: initialData.number ?? '',
          complement: initialData.complement ?? '',
          neighborhood: initialData.neighborhood ?? '',
          city_id: initialData.city?.id ?? null,
          is_active: initialData.is_active,
          contact_name: initialData.contact_name ?? '',
          contact_phone: initialData.contact_phone ?? '',
          contact_email: initialData.contact_email ?? '',
          plan_id: initialData.plan?.id ?? null,
          allow_simulated_environment_for_emitters:
            initialData.allow_simulated_environment_for_emitters ?? true,
        }
      : {
          cnpj: '',
          name: '',
          trade_name: '',
          zip_code: '',
          address: '',
          number: '',
          complement: '',
          neighborhood: '',
          is_active: true,
          city_id: null,
          contact_name: '',
          contact_phone: '',
          contact_email: '',
          plan_id: null,
          allow_simulated_environment_for_emitters: true,
        },
  })

  const {
    cities,
    selectedUf,
    setSelectedUf,
    loadingCities,
    handleCepBlur,
    isLoadingCep,
  } = useCepAutoFill(setValue, initialData?.city?.uf ?? '')
  const { data: plansData } = useQuery({
    queryKey: ['plans', 'active'],
    queryFn: async () => {
      const res = await call('/api/billing/plans?is_active=true&page_size=100')
      if (!res.ok)
        return { results: [] as { id: string; name: string; price: string }[] }
      return res.json() as Promise<{
        results: { id: string; name: string; price: string }[]
      }>
    },
  })
  const plans = plansData?.results ?? []

  const cnpjValue = watch('cnpj') ?? ''
  const normalizedCnpj = normalizeDocument(cnpjValue)
  const hasInvalidCnpjRealtime =
    normalizedCnpj.length > 0 &&
    (normalizedCnpj.length > 14 ||
      (normalizedCnpj.length === 14 && !isValidCpfOrCnpj(cnpjValue)))

  const onInvalid = () =>
    toast.error('Não foi possível salvar', {
      description:
        'Existem campos obrigatórios ou inválidos que precisam de sua atenção.',
    })

  const onSubmit = async (data: CompanyFormData) => {
    setIsSaving(true)
    try {
      const method = initialData ? 'PATCH' : 'POST'
      const url = initialData ? `/api/companies/${initialData.id}/` : '/api/companies/'
      const body = data

      const res = await call(url, {
        method,
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error()

      await queryClient.invalidateQueries({ queryKey: ['companies'] })
      router.push('/companies')
    } catch {
      toast.error('Erro ao salvar empresa. Verifique os dados.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Building2 className="size-6 text-muted-foreground" />
            {initialData ? 'Editar Empresa' : 'Nova Empresa'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl font-bold shadow-sm px-6"
            onClick={() => router.push('/companies')}
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
        <div className="flex flex-wrap items-start gap-6">
          {initialData && (
            <div className="flex items-center justify-between cursor-pointer select-none rounded-xl border px-4 py-3 hover:bg-muted/40 transition-colors w-full">
              <span className="text-sm font-medium">Empresa ativa *</span>
              <Switch
                checked={watch('is_active')}
                onCheckedChange={checked =>
                  setValue('is_active', checked, { shouldDirty: true })
                }
              />
            </div>
          )}

          <div className="w-full md:w-[200px] space-y-1.5">
            <Label
              htmlFor="cnpj"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              CNPJ *
            </Label>
            <Controller
              name="cnpj"
              control={control}
              render={({ field }) => (
                <Input
                  id="cnpj"
                  {...field}
                  value={formatCpfOrCnpj(field.value)}
                  onChange={e => field.onChange(normalizeDocument(e.target.value))}
                  aria-invalid={!!errors.cnpj || hasInvalidCnpjRealtime}
                  className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
                />
              )}
            />
            {(errors.cnpj || hasInvalidCnpjRealtime) && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.cnpj?.message || 'CNPJ inválido'}
              </p>
            )}
          </div>

          <div className="flex-1 min-w-[280px] space-y-1.5">
            <Label
              htmlFor="name"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Razão Social *
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

          <div className="flex-1 min-w-[240px] space-y-1.5">
            <Label
              htmlFor="trade_name"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Nome Fantasia
            </Label>
            <Input
              id="trade_name"
              {...register('trade_name')}
              aria-invalid={!!errors.trade_name}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.trade_name && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.trade_name.message}
              </p>
            )}
          </div>

          <div className="w-full border-t border-muted-foreground/10" />

          <div className="w-full md:w-[160px] space-y-1.5">
            <Label
              htmlFor="zip_code"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              CEP
            </Label>
            <Controller
              name="zip_code"
              control={control}
              render={({ field }) => (
                <div className="relative">
                  <Input
                    id="zip_code"
                    inputMode="numeric"
                    aria-invalid={!!errors.zip_code}
                    className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20 pr-8"
                    value={formatCep(field.value)}
                    onChange={e => field.onChange(cleanCep(e.target.value))}
                    onKeyDown={cepKeyDown}
                    onPaste={e => {
                      e.preventDefault()
                      field.onChange(cleanCep(e.clipboardData.getData('text')))
                    }}
                    onBlur={e => {
                      field.onBlur()
                      handleCepBlur(e.target.value)
                    }}
                  />
                  {isLoadingCep && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
            />
            {errors.zip_code && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.zip_code.message}
              </p>
            )}
          </div>

          <div className="flex-1 min-w-[260px] space-y-1.5">
            <Label
              htmlFor="address"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Endereço
            </Label>
            <Input
              id="address"
              {...register('address')}
              aria-invalid={!!errors.address}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.address && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.address.message}
              </p>
            )}
          </div>

          <div className="w-full md:w-[100px] space-y-1.5">
            <Label
              htmlFor="number"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Número
            </Label>
            <Input
              id="number"
              {...register('number')}
              aria-invalid={!!errors.number}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.number && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.number.message}
              </p>
            )}
          </div>

          <div className="w-full md:w-[200px] space-y-1.5">
            <Label
              htmlFor="complement"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Complemento
            </Label>
            <Input
              id="complement"
              {...register('complement')}
              aria-invalid={!!errors.complement}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.complement && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.complement.message}
              </p>
            )}
          </div>

          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label
              htmlFor="neighborhood"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Bairro
            </Label>
            <Input
              id="neighborhood"
              {...register('neighborhood')}
              aria-invalid={!!errors.neighborhood}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.neighborhood && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.neighborhood.message}
              </p>
            )}
          </div>

          <div className="w-full md:w-[120px] space-y-1.5">
            <Label
              htmlFor="uf"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              UF
            </Label>
            <NativeSelect
              id="uf"
              value={selectedUf}
              onChange={e => {
                setSelectedUf(e.target.value)
                setValue('city_id', null)
              }}
            >
              <NativeSelectOption value="">UF</NativeSelectOption>
              {UF_LIST.map(uf => (
                <NativeSelectOption key={uf} value={uf}>
                  {uf}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label
              htmlFor="city_id"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Cidade
            </Label>
            <Controller
              name="city_id"
              control={control}
              render={({ field }) => (
                <div className="space-y-1.5">
                  <NativeSelect
                    id="city_id"
                    aria-invalid={!!errors.city_id}
                    value={field.value ?? ''}
                    onChange={e => field.onChange(e.target.value || null)}
                    disabled={!selectedUf || loadingCities}
                  >
                    <NativeSelectOption value="">
                      {loadingCities
                        ? 'Carregando...'
                        : !selectedUf
                          ? 'Selecione a UF primeiro'
                          : 'Selecione a cidade'}
                    </NativeSelectOption>
                    {cities.map(city => (
                      <NativeSelectOption key={city.id} value={city.id}>
                        {city.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {errors.city_id && (
                    <p className="text-[10px] text-destructive font-medium ml-1">
                      {errors.city_id.message}
                    </p>
                  )}
                </div>
              )}
            />
          </div>

          <div className="w-full border-t border-muted-foreground/10" />

          <div className="flex-1 min-w-[260px] space-y-1.5">
            <Label
              htmlFor="contact_name"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Nome do Contato
            </Label>
            <Input
              id="contact_name"
              {...register('contact_name')}
              aria-invalid={!!errors.contact_name}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.contact_name && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.contact_name.message}
              </p>
            )}
          </div>

          <div className="w-full md:w-[200px] space-y-1.5">
            <Label
              htmlFor="contact_phone"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Telefone
            </Label>
            <Controller
              name="contact_phone"
              control={control}
              render={({ field }) => (
                <div className="space-y-1.5">
                  <Input
                    id="contact_phone"
                    aria-invalid={!!errors.contact_phone}
                    className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
                    value={formatPhone(field.value)}
                    onChange={e => field.onChange(cleanPhone(e.target.value))}
                  />
                  {errors.contact_phone && (
                    <p className="text-[10px] text-destructive font-medium ml-1">
                      {errors.contact_phone.message}
                    </p>
                  )}
                </div>
              )}
            />
          </div>

          <div className="flex-1 min-w-[260px] space-y-1.5">
            <Label
              htmlFor="contact_email"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              E-mail de Contato
            </Label>
            <Input
              id="contact_email"
              {...register('contact_email')}
              aria-invalid={!!errors.contact_email}
              className="h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20"
            />
            {errors.contact_email && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.contact_email.message}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Configurações de Emissão
        </h2>
        <div className="flex flex-wrap items-start gap-6">
          <div className="w-full md:w-[280px] space-y-1.5">
            <Label
              htmlFor="plan_id"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1"
            >
              Plano
            </Label>
            <Controller
              name="plan_id"
              control={control}
              render={({ field }) => (
                <NativeSelect
                  id="plan_id"
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value || null)}
                  aria-invalid={!!errors.plan_id}
                >
                  <option value="">Sem plano</option>
                  {plans.map(p => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name} — R$ {p.price}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            />
          </div>

          <div className="w-full border-t pt-4 mt-2">
            <Controller
              name="allow_simulated_environment_for_emitters"
              control={control}
              render={({ field }) => (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold">
                      Ambiente Simulado para Emitentes
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Quando desativado, emitentes precisam de certificado digital A1
                      para qualquer ambiente. O Simulado não estará disponível.
                    </p>
                  </div>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </div>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
