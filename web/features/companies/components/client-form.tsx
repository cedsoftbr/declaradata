'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { companiesApi } from '@/features/companies/api'
import { PersonCertificateForm } from '@/features/persons/components/person-certificate-form'
import { type PersonFormData, personSchema } from '@/features/persons/schemas'
import { useApi } from '@/hooks/use-api'
import { useViaCep } from '@/hooks/use-viacep'
import type { City, Person } from '@/lib/api'
import { UF_LIST } from '@/lib/constants'
import { formatCpfOrCnpj, isValidCpfOrCnpj, normalizeDocument } from '@/lib/document'
import { cepKeyDown, cleanCep, cleanPhone, formatCep, formatPhone } from '@/lib/utils'

interface Props {
  initialData?: Person | null
}

const API_FIELD_MAP: Partial<Record<string, keyof PersonFormData>> = {
  name: 'name',
  document: 'document',
  zip_code: 'zip_code',
  address: 'address',
  number: 'number',
  complement: 'complement',
  neighborhood: 'neighborhood',
  city_id: 'city_id',
  contact_phone: 'contact_phone',
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dense form with many fields and address logic
export function PersonForm({ initialData }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { call } = useApi()
  const { user, accessToken: token } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [selectedUf, setSelectedUf] = useState<string>(initialData?.city?.uf ?? '')
  const [cities, setCities] = useState<City[]>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [hasActiveCertificate, setHasActiveCertificate] = useState(false)
  const companyId = user?.company_id
  const { data: company } = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => companiesApi.get(token ?? '', companyId ?? ''),
    enabled: !!token && !!companyId,
    staleTime: 5 * 60 * 1000,
  })
  const pendingIbgeCode = useRef<string | null>(null)
  const { lookup: lookupViaCep, isLoading: isLoadingCep } = useViaCep()

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    watch,
    formState: { errors, isDirty },
  } = useForm<PersonFormData>({
    resolver: zodResolver(personSchema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          document: initialData.document,
          tipo: initialData.is_carrier ? 'transportador' : 'cliente',
          is_active: initialData.is_active,
          is_emitente: initialData.is_emitente ?? false,
          tp_emit: initialData.tp_emit ?? 2,
          environment: 3,
          series: [],
          zip_code: initialData.zip_code,
          address: initialData.address,
          number: initialData.number,
          complement: initialData.complement,
          neighborhood: initialData.neighborhood,
          city_id: initialData.city?.id ?? '',
          contact_phone: initialData.contact_phone ?? '',
        }
      : {
          name: '',
          document: '',
          zip_code: '',
          address: '',
          number: '',
          neighborhood: '',
          is_active: true,
          is_emitente: false,
          tp_emit: 2,
          environment: 3,
          series: [],
          tipo: 'cliente',
          city_id: '',
          contact_phone: '',
        },
  })

  useFieldArray({
    control,
    name: 'series',
  })

  const isEmitente = watch('is_emitente')
  const currentEnv = watch('environment')
  const currentSeries = watch('series')
  const hasLoadedSeries = useRef(false)

  useEffect(() => {
    if (!isEmitente) {
      hasLoadedSeries.current = false
      return
    }

    if (hasLoadedSeries.current) return

    const env = (currentEnv || 3) as 1 | 3
    const series = currentSeries || []

    if (initialData?.id) {
      hasLoadedSeries.current = true
      call(`/api/shipments/series/?emitter=${initialData.id}`)
        .then(res => {
          if (!res.ok) return []
          return res.json()
        })
        .then(data => {
          interface ApiSeries {
            id: string
            code: number
            last_number: number
            is_active: boolean
            ambient: number
          }
          const apiSeries = (
            Array.isArray(data) ? data : data.results || []
          ) as ApiSeries[]
          if (apiSeries.length > 0) {
            setValue(
              'series',
              apiSeries.map(s => ({
                ...s,
                original_last_number: s.last_number,
                next_number: s.last_number + 1,
              }))
            )
          } else {
            setValue('series', [
              {
                code: 1,
                last_number: 0,
                original_last_number: 0,
                next_number: 1,
                is_active: true,
                ambient: env,
              },
            ])
          }
        })
        .catch(() => {
          setValue('series', [
            {
              code: 1,
              last_number: 0,
              original_last_number: 0,
              next_number: 1,
              is_active: true,
              ambient: env,
            },
          ])
        })
    } else if (series.length === 0) {
      hasLoadedSeries.current = true
      setValue('series', [
        {
          code: 1,
          last_number: 0,
          original_last_number: 0,
          next_number: 1,
          is_active: true,
          ambient: env,
        },
      ])
    }
  }, [initialData?.id, isEmitente, call, setValue, currentSeries, currentEnv])

  useEffect(() => {
    if (!selectedUf) {
      setCities([])
      return
    }
    setLoadingCities(true)
    call(`/api/locations/cities?uf=${selectedUf}&page_size=1000`)
      .then(res => res.json())
      .then(data => {
        const cityList: City[] = Array.isArray(data)
          ? (data as City[])
          : ((data?.results as City[] | undefined) ?? [])
        setCities(cityList)
        if (pendingIbgeCode.current) {
          const match = cityList.find(c => c.ibge_code === pendingIbgeCode.current)
          if (match) setValue('city_id', match.id)
          pendingIbgeCode.current = null
        }
      })
      .catch(() => toast.error('Erro ao carregar cidades'))
      .finally(() => setLoadingCities(false))
  }, [call, selectedUf, setValue])

  const documentValue = watch('document') ?? ''
  const normalizedDocument = normalizeDocument(documentValue)
  const isCNPJ = normalizedDocument.length > 11
  const hasInvalidDocumentRealtime =
    normalizedDocument.length > 0 &&
    (normalizedDocument.length > 14 ||
      ([11, 14].includes(normalizedDocument.length) &&
        !isValidCpfOrCnpj(documentValue)))

  useEffect(() => {
    if (!isCNPJ) setValue('tipo', 'cliente')
  }, [isCNPJ, setValue])

  const matchCityByIbge = (ibgeCode: string) => {
    if (!loadingCities && cities.length > 0) {
      const match = cities.find(c => c.ibge_code === ibgeCode)
      if (match) {
        setValue('city_id', match.id)
        pendingIbgeCode.current = null
      }
    }
  }

  const lookupCep = async (raw: string) => {
    const data = await lookupViaCep(raw)
    if (!data) return
    if (data.logradouro) setValue('address', data.logradouro)
    if (data.bairro) setValue('neighborhood', data.bairro)
    if (!data.uf) return

    const ibgeCode = data.ibge ?? null
    pendingIbgeCode.current = ibgeCode

    if (data.uf !== selectedUf) {
      setSelectedUf(data.uf)
      setValue('city_id', '')
    } else if (ibgeCode) {
      matchCityByIbge(ibgeCode)
    }
  }

  const handleApiError = useCallback(
    async (res: Response, fallback: string) => {
      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        string | string[]
      >
      let hasFieldError = false
      for (const [field, messages] of Object.entries(body)) {
        const formField = API_FIELD_MAP[field]
        if (formField) {
          const msg = Array.isArray(messages) ? messages[0] : String(messages)
          setError(formField, { message: msg })
          hasFieldError = true
        }
      }
      if (!hasFieldError) {
        const msg = Object.values(body).flat().join(' ') || fallback
        toast.error(msg)
      }
    },
    [setError]
  )

  const onInvalid = () => toast.error('Há campos obrigatórios não preenchidos')

  const postOrPatchSeries = async (
    payload: Record<string, unknown>,
    personId: string,
    code: number,
    ambient: number
  ): Promise<Response> => {
    const res = await call('/api/shipments/series/', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (res.ok) return res
    const existing = await call(`/api/shipments/series/?emitter=${personId}`)
    if (existing.ok) {
      const data = await existing.json()
      const list = Array.isArray(data) ? data : (data.results ?? [])
      const found =
        list.find(
          (x: { code: number; ambient: number }) =>
            x.code === code && x.ambient === ambient
        ) ?? list.find((x: { code: number }) => x.code === code)
      if (found?.id) {
        return call(`/api/shipments/series/${found.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      }
    }
    return res
  }

  const saveExtraData =
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles series, environment and address saving sequentially
    async (personId: string, data: PersonFormData): Promise<void> => {
      const {
        is_emitente,
        series,
        environment,
        contact_phone,
        zip_code,
        address,
        number,
        complement,
        neighborhood,
        city_id,
      } = data
      const extraPromises: Promise<Response>[] = []

      // 1. Series
      if (is_emitente && series) {
        for (const s of series) {
          const { id: sId, original_last_number, next_number, ...sData } = s
          const lastNumToSend =
            next_number !== undefined ? next_number - 1 : (original_last_number ?? 0)
          const shouldChangeLastNumber =
            next_number !== undefined &&
            lastNumToSend >= 0 &&
            lastNumToSend !== (original_last_number ?? 0)
          const seriesPayload = {
            ...sData,
            last_number: lastNumToSend,
            emitter: personId,
            change_last_number: shouldChangeLastNumber,
          }

          if (sId) {
            extraPromises.push(
              (async () => {
                const res = await call(`/api/shipments/series/${sId}/`, {
                  method: 'PATCH',
                  body: JSON.stringify(seriesPayload),
                })
                if (res.ok) return res
                // Fallback: em caso de id inválido/obsoleto no form, resolve por código+ambiente
                return postOrPatchSeries(
                  seriesPayload,
                  personId,
                  sData.code,
                  sData.ambient
                )
              })()
            )
          } else {
            // Série nova: tenta POST; se já existir, busca e faz PATCH
            extraPromises.push(
              postOrPatchSeries(seriesPayload, personId, sData.code, sData.ambient)
            )
          }
        }
      }

      // 2. Environment
      if (is_emitente && environment && user?.company_id) {
        extraPromises.push(
          call(`/api/companies/${user.company_id}/environment/`, {
            method: 'PATCH',
            body: JSON.stringify({ environment }),
          })
        )
      }

      // 3. Address
      const addressPayload = {
        label: 'Principal',
        contact_phone,
        zip_code,
        address,
        number,
        complement,
        neighborhood,
        city_id,
        is_default: true,
        is_active: true,
      }
      extraPromises.push(
        call(`/api/persons/${personId}/addresses/`, {
          method: 'POST',
          body: JSON.stringify(addressPayload),
        })
      )

      const results = await Promise.all(extraPromises)
      const firstError = results.find(r => !r.ok)
      if (firstError) {
        throw new Error('Erro ao salvar dados complementares (séries ou endereço).')
      }
    }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles complex multi-step saving of person and address
  const onSubmit = async (data: PersonFormData) => {
    if (data.is_emitente && !hasActiveCertificate && data.environment !== 3) {
      toast.error(
        'Ambiente Homologação e Produção requerem certificado digital A1. Adicione o certificado ou selecione o ambiente Simulado.'
      )
      return
    }
    setIsSaving(true)
    try {
      const { _city_label, tipo, is_emitente, tp_emit, name, document, is_active } =
        data

      const payload = {
        name,
        document,
        is_active,
        is_carrier: tipo === 'transportador',
        is_emitente: is_emitente ?? false,
        tp_emit: is_emitente ? tp_emit : undefined,
        company_id: user?.company_id ?? undefined,
      }

      const url = initialData ? `/api/persons/${initialData.id}/` : '/api/persons/'
      const res = await call(url, {
        method: initialData ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        await handleApiError(res, 'Erro ao salvar.')
        return
      }

      const savedPerson = (await res.json()) as Person
      const personId = initialData?.id || savedPerson.id
      if (!personId) {
        toast.error('Pessoa salva, mas não foi possível identificar o cadastro.')
        return
      }

      await saveExtraData(personId, data)

      toast.success(initialData ? 'Pessoa atualizada.' : 'Pessoa cadastrada.')
      await queryClient.invalidateQueries({ queryKey: ['persons'] })
      await queryClient.invalidateQueries({ queryKey: ['emitters'] })
      if (user?.company_id) {
        await queryClient.invalidateQueries({ queryKey: ['company', user.company_id] })
      }
      router.push('/persons')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setIsSaving(false)
    }
  }

  const inp = 'h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20'
  const isAdmin = user?.profile === 'admin' || user?.profile === 'superadmin'
  const currentEnvironment = watch('environment')
  const blockNoCert = isEmitente && !hasActiveCertificate && currentEnvironment !== 3

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <Users className="size-6 text-muted-foreground" />
          {initialData ? 'Editar Pessoa' : 'Nova Pessoa'}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl font-bold shadow-sm px-6"
            onClick={() => router.push('/persons')}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit(onSubmit, onInvalid)}
            disabled={isSaving || !isDirty || blockNoCert}
            title={
              blockNoCert
                ? 'Homologação e Produção requerem certificado A1. Selecione Simulado ou adicione o certificado.'
                : undefined
            }
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

      <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-5">
        {/* ... (rest of the form remains same until PersonCertificateForm) ... */}
        <div className="flex flex-wrap gap-3">
          {initialData && (
            <Controller
              name="is_active"
              control={control}
              render={({ field }) => (
                <div className="flex items-center justify-between cursor-pointer select-none rounded-xl border px-4 py-3 hover:bg-muted/40 transition-colors flex-1 min-w-[200px]">
                  <span className="text-sm font-medium">Ativo</span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </div>
              )}
            />
          )}
          {isAdmin && initialData && (
            <Controller
              name="is_emitente"
              control={control}
              render={({ field }) => (
                <div className="flex items-center justify-between cursor-pointer select-none rounded-xl border px-4 py-3 hover:bg-muted/40 transition-colors flex-1 min-w-[200px]">
                  <div>
                    <span className="text-sm font-medium">Emitente DCe</span>
                  </div>
                  <Switch
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    disabled={hasActiveCertificate}
                  />
                </div>
              )}
            />
          )}
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="w-full md:w-[180px] space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Tipo *
            </Label>
            <Controller
              name="tipo"
              control={control}
              render={({ field }) => (
                <NativeSelect
                  aria-invalid={!!errors.tipo}
                  value={field.value}
                  onChange={field.onChange}
                >
                  <NativeSelectOption value="cliente">Cliente</NativeSelectOption>
                  <NativeSelectOption value="transportador">
                    Transportador
                  </NativeSelectOption>
                </NativeSelect>
              )}
            />
          </div>

          <div className="flex-1 min-w-[260px] space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Nome / Razão Social *
            </Label>
            <Input {...register('name')} aria-invalid={!!errors.name} className={inp} />
          </div>

          <div className="w-full md:w-[220px] space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              CPF / CNPJ *
            </Label>
            <Controller
              name="document"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  value={formatCpfOrCnpj(field.value)}
                  onChange={e => field.onChange(normalizeDocument(e.target.value))}
                  disabled={!!initialData}
                  aria-invalid={!!errors.document || hasInvalidDocumentRealtime}
                  className={inp}
                />
              )}
            />
            {(errors.document || hasInvalidDocumentRealtime) && (
              <p className="text-[10px] text-destructive font-medium ml-1">
                {errors.document?.message || 'Documento inválido (CPF ou CNPJ)'}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[200px] space-y-1.5">
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
                <Input
                  id="contact_phone"
                  aria-invalid={!!errors.contact_phone}
                  className={inp}
                  value={formatPhone(field.value)}
                  onChange={e => field.onChange(cleanPhone(e.target.value))}
                />
              )}
            />
          </div>
        </div>

        <div className="border-t border-muted-foreground/10" />

        <div className="flex flex-wrap items-start gap-4">
          <div className="w-full md:w-[160px] space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              CEP *
            </Label>
            <Controller
              name="zip_code"
              control={control}
              render={({ field }) => (
                <div className="relative">
                  <Input
                    {...field}
                    inputMode="numeric"
                    aria-invalid={!!errors.zip_code}
                    className={`${inp} pr-8`}
                    value={formatCep(field.value)}
                    onChange={e => field.onChange(cleanCep(e.target.value))}
                    onKeyDown={cepKeyDown}
                    onPaste={e => {
                      e.preventDefault()
                      field.onChange(cleanCep(e.clipboardData.getData('text')))
                    }}
                    onBlur={e => {
                      field.onBlur()
                      lookupCep(e.target.value)
                    }}
                  />
                  {isLoadingCep && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
            />
          </div>

          <div className="flex-1 min-w-[240px] space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Logradouro *
            </Label>
            <Input
              {...register('address')}
              aria-invalid={!!errors.address}
              className={inp}
            />
          </div>

          <div className="w-full md:w-[100px] space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Número *
            </Label>
            <Input
              {...register('number')}
              aria-invalid={!!errors.number}
              className={inp}
            />
          </div>

          <div className="w-full md:w-[180px] space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Complemento
            </Label>
            <Input
              {...register('complement')}
              aria-invalid={!!errors.complement}
              className={inp}
            />
          </div>

          <div className="flex-1 min-w-[180px] space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Bairro *
            </Label>
            <Input
              {...register('neighborhood')}
              aria-invalid={!!errors.neighborhood}
              className={inp}
            />
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
                setValue('city_id', '')
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
              Cidade *
            </Label>
            <Controller
              name="city_id"
              control={control}
              render={({ field }) => (
                <NativeSelect
                  id="city_id"
                  aria-invalid={!!errors.city_id}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value || '')}
                  disabled={!selectedUf || loadingCities}
                >
                  <NativeSelectOption value="">
                    {loadingCities
                      ? 'Carregando...'
                      : !selectedUf
                        ? 'Selecione a UF'
                        : 'Selecione a cidade'}
                  </NativeSelectOption>
                  {cities.map(city => (
                    <NativeSelectOption key={city.id} value={city.id}>
                      {city.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            />
          </div>
        </div>
      </div>

      {isAdmin && watch('is_emitente') && (
        <div className="bg-card border rounded-2xl p-6 shadow-sm animate-in slide-in-from-top-4 duration-300">
          {initialData?.id ? (
            <PersonCertificateForm
              personId={initialData.id}
              onStatusChange={setHasActiveCertificate}
              control={control}
              setValue={setValue}
              allowSimulated={company?.allow_simulated_environment_for_emitters ?? true}
              initialEnvironment={company?.environment}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="size-6 text-primary" />
              </div>
              <div className="max-w-xs">
                <p className="text-sm font-bold">Quase lá!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Salve o cadastro da pessoa primeiro para poder configurar o
                  certificado digital e o ambiente.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
