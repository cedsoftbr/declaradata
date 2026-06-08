'use client'

import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  type Control,
  Controller,
  type UseFormSetValue,
  useFieldArray,
  useWatch,
} from 'react-hook-form'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import type { PersonCertificateStatus } from '@/features/persons/api'
import { useApi } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import type { PersonFormData } from '../schemas'

interface Props {
  personId: string
  onStatusChange?: (hasCertificate: boolean) => void
  control: Control<PersonFormData>
  setValue: UseFormSetValue<PersonFormData>
  allowSimulated?: boolean
  initialEnvironment?: 1 | 2 | 3
}

const inp = 'h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20'

function EmissionParameters({
  control,
  allowSimulated,
}: {
  control: Control<PersonFormData>
  allowSimulated: boolean
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
          Tipo de Emitente
        </Label>
        <Controller
          name="tp_emit"
          control={control}
          render={({ field }) => (
            <NativeSelect
              value={field.value}
              onChange={e => field.onChange(Number(e.target.value))}
              className={inp}
            >
              <NativeSelectOption value={1}>Marketplace</NativeSelectOption>
              <NativeSelectOption value={2}>Emissor Próprio</NativeSelectOption>
              <NativeSelectOption value={3}>Transportadora</NativeSelectOption>
            </NativeSelect>
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
          Ambiente
        </Label>
        <Controller
          name="environment"
          control={control}
          render={({ field }) => (
            <NativeSelect
              value={field.value}
              onChange={e => field.onChange(Number(e.target.value))}
              className={inp}
            >
              {allowSimulated && (
                <NativeSelectOption value={3}>Simulado</NativeSelectOption>
              )}
              <NativeSelectOption value={2}>Homologação</NativeSelectOption>
              <NativeSelectOption value={1}>Produção</NativeSelectOption>
            </NativeSelect>
          )}
        />
      </div>
    </div>
  )
}

function SeriesRow({
  index,
  control,
  onRemove,
  onActivate,
}: {
  index: number
  control: Control<PersonFormData>
  onRemove: () => void
  onActivate: () => void
}) {
  const ambient = useWatch({ control, name: `series.${index}.ambient` })
  const originalLastNumber =
    useWatch({ control, name: `series.${index}.original_last_number` }) ?? 0
  const nextNumber = useWatch({ control, name: `series.${index}.next_number` })
  const isSimulado = ambient === 3
  const hasSequenceError = nextNumber !== undefined && nextNumber <= originalLastNumber

  const numInp =
    'h-9 rounded-xl border-muted-foreground/20 focus-visible:ring-primary/20 font-mono text-sm w-[100px]'

  return (
    <div className="flex flex-wrap items-start gap-2">
      {/* Série (code) */}
      <Controller
        name={`series.${index}.code`}
        control={control}
        render={({ field }) => (
          <div className="relative">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={3}
              value={field.value === 0 ? '' : field.value}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '')
                field.onChange(val === '' ? 0 : Number(val))
              }}
              placeholder="1"
              className={cn(
                numInp,
                'w-[60px]',
                isSimulado && 'bg-muted/50 text-muted-foreground'
              )}
              disabled={isSimulado}
            />
            {isSimulado && (
              <Lock className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/40" />
            )}
          </div>
        )}
      />

      {/* Último número emitido (readonly) */}
      <div className="h-9 flex items-center px-3 rounded-xl border border-muted-foreground/20 bg-muted/30 font-mono text-sm text-muted-foreground select-none w-[100px]">
        {originalLastNumber}
      </div>

      {/* Próximo número */}
      <div className="space-y-1">
        <Controller
          name={`series.${index}.next_number`}
          control={control}
          render={({ field }) => (
            <Input
              type="text"
              inputMode="numeric"
              maxLength={10}
              value={field.value === undefined ? '' : field.value}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                field.onChange(val === '' ? undefined : Number(val))
              }}
              placeholder={String(originalLastNumber + 1)}
              className={cn(
                numInp,
                hasSequenceError
                  ? 'border-destructive focus-visible:ring-destructive/30'
                  : ''
              )}
            />
          )}
        />
        {hasSequenceError && (
          <p className="text-[10px] text-destructive font-medium ml-1 whitespace-nowrap">
            Mínimo: {originalLastNumber + 1}
          </p>
        )}
      </div>

      {/* Ativo */}
      <Controller
        name={`series.${index}.is_active`}
        control={control}
        render={({ field }) => (
          <Badge
            variant={field.value ? 'default' : 'outline'}
            className={cn(
              'cursor-pointer uppercase text-[10px] font-bold py-1 px-3 rounded-full transition-all h-9 flex items-center',
              field.value
                ? 'bg-green-500 hover:bg-green-600 text-white border-transparent'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
            onClick={onActivate}
          >
            {field.value ? 'Ativo' : 'Ativar'}
          </Badge>
        )}
      />

      {/* Excluir */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg disabled:opacity-30"
        onClick={onRemove}
        disabled={isSimulado}
        title={isSimulado ? 'Não é permitido excluir série do Simulado' : undefined}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex form with certificate logic
export function PersonCertificateForm({
  personId,
  onStatusChange,
  control,
  setValue,
  allowSimulated = true,
  initialEnvironment,
}: Props) {
  const { call } = useApi()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [certFile, setCertFile] = useState<File | null>(null)
  const [certPass, setCertPass] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [status, setStatus] = useState<PersonCertificateStatus | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'series',
  })

  const environment = useWatch({ control, name: 'environment' })
  const seriesValues = useWatch({ control, name: 'series' })

  useEffect(() => {
    const hasValidInitialEnvironment = [1, 2, 3].includes(initialEnvironment ?? 0)
    const environmentWithCertificate =
      hasValidInitialEnvironment && (allowSimulated || initialEnvironment !== 3)
        ? (initialEnvironment as 1 | 2 | 3)
        : 2

    let isMounted = true
    setIsLoadingStatus(true)
    call(`/api/persons/${personId}/certificate/status/`)
      .then(res => res.json())
      .then((data: PersonCertificateStatus) => {
        if (!isMounted) return
        const hasCert = !!data.has_certificate
        setStatus(hasCert ? data : null)
        onStatusChange?.(hasCert)
        if (hasCert) {
          setValue('environment', data.environment ?? environmentWithCertificate)
        } else {
          setValue('environment', allowSimulated ? 3 : 2)
        }
      })
      .catch(() => {
        if (!isMounted) return
        setStatus(null)
        onStatusChange?.(false)
        setValue('environment', allowSimulated ? 3 : 2)
      })
      .finally(() => {
        if (!isMounted) return
        setIsLoadingStatus(false)
      })

    return () => {
      isMounted = false
    }
  }, [call, personId, onStatusChange, setValue, initialEnvironment, allowSimulated])

  useEffect(() => {
    if (!allowSimulated && environment === 3) {
      setValue('environment', 2)
    }
  }, [allowSimulated, environment, setValue])

  const prevEnvironmentRef = useRef<number | undefined>(undefined)
  // biome-ignore lint/correctness/useExhaustiveDependencies: call/personId/status são estáveis; dependências intencionalmente omitidas
  useEffect(() => {
    if (environment === 3) {
      prevEnvironmentRef.current = environment
      return
    }
    if (prevEnvironmentRef.current === environment) return
    const prev = prevEnvironmentRef.current
    prevEnvironmentRef.current = environment

    const hasSeries = seriesValues?.some(s => s.ambient === environment)

    // Desativa todas as séries existentes antes de ativar a do novo ambiente
    if (seriesValues) {
      for (let i = 0; i < seriesValues.length; i++) {
        if (seriesValues[i].is_active) {
          update(i, { ...seriesValues[i], is_active: false })
        }
      }
    }

    if (!hasSeries) {
      append({
        code: 1,
        last_number: 0,
        original_last_number: 0,
        next_number: 1,
        is_active: true,
        ambient: environment as 1 | 2,
      })
    } else {
      // Ativa a série existente do novo ambiente
      const idx = seriesValues?.findIndex(s => s.ambient === environment) ?? -1
      if (idx >= 0 && seriesValues) {
        update(idx, { ...seriesValues[idx], is_active: true })
      }
    }

    // Salva o ambiente no certificado existente quando o usuário muda o select
    if (prev !== undefined && status) {
      call(`/api/persons/${personId}/certificate/environment/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      })
        .then(res => {
          if (res.ok) toast.success('Ambiente atualizado.')
          else toast.error('Erro ao salvar ambiente.')
        })
        .catch(() => toast.error('Erro ao salvar ambiente.'))
    }
  }, [environment, seriesValues?.some, append])

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: certificate upload process
  const handleUpload = async () => {
    if (!certFile || !certPass) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('certificate', certFile)
      formData.append('password', certPass)
      formData.append('environment', String(environment))

      const res = await call(`/api/persons/${personId}/certificate/`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as Record<string, string[]>
        const msg =
          (err.non_field_errors ?? err.certificate ?? err.password ?? [])[0] ||
          'Senha incorreta ou arquivo inválido.'
        throw new Error(msg)
      }

      const data = (await res.json()) as PersonCertificateStatus
      const hasCert = !!data.has_certificate
      setStatus(hasCert ? data : null)
      onStatusChange?.(hasCert)

      if (hasCert) {
        const hasHomologSeries = seriesValues?.some(s => s.ambient === 2)
        if (!hasHomologSeries) {
          // Remove séries temporárias de Simulado (sem id) antes de adicionar a de Homologação
          const currentFields = seriesValues ?? []
          const withoutTempSimulated = currentFields.filter(
            s => s.ambient !== 3 || s.id
          )
          setValue('series', [
            ...withoutTempSimulated,
            {
              code: 1,
              last_number: 0,
              original_last_number: 0,
              next_number: 1,
              is_active: true,
              ambient: 2,
            },
          ])
        }
      }

      toast.success('Certificado digital configurado com sucesso!')
      setCertFile(null)
      setCertPass('')
      setIsModalOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Erro ao fazer upload do certificado.'
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await call(`/api/persons/${personId}/certificate/`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Falha ao remover.')
      setStatus(null)
      onStatusChange?.(false)
      setValue('environment', allowSimulated ? 3 : 2)
      if (!allowSimulated) {
        setValue('is_emitente', false)
        await call(`/api/persons/${personId}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_emitente: false }),
        })
      }
      toast.success('Certificado removido.')
    } catch {
      toast.error('Erro ao remover certificado.')
    } finally {
      setIsDeleting(false)
    }
  }

  const toggleActive = (index: number) => {
    if (!seriesValues) return
    for (let i = 0; i < seriesValues.length; i++) {
      update(i, {
        ...seriesValues[i],
        is_active: i === index,
      })
    }
  }

  const expiryLabel = status?.cert_expires_at
    ? new Date(status.cert_expires_at).toLocaleDateString('pt-BR')
    : 'Desconhecido'

  return (
    <div className="space-y-6">
      <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-muted-foreground" />
            <h3 className="text-base font-bold">Parâmetros de Emissão</h3>
          </div>

          {!status && !isLoadingStatus && (
            <Button
              type="button"
              onClick={() => {
                setCertFile(null)
                setCertPass('')
                setIsModalOpen(true)
              }}
              className="h-9 rounded-xl font-bold px-4 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
            >
              <Upload className="size-3.5 mr-2" />
              Incluir Certificado
            </Button>
          )}
        </div>

        {(isLoadingStatus || status) && (
          <div className="w-full">
            {isLoadingStatus ? (
              <Skeleton className="h-[64px] rounded-xl" />
            ) : status ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 py-3 px-4 rounded-xl bg-green-500/5 border border-green-500/10">
                <div className="flex items-center gap-4">
                  <div className="size-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="size-5 text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-green-700 truncate">
                      Certificado Ativo
                    </p>
                    <p className="text-[10px] text-green-600/80 mt-0.5 truncate">
                      Válido até: <span className="font-bold">{expiryLabel}</span>
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDeleteModalOpen(true)}
                  disabled={isDeleting}
                  className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg px-3 font-bold text-[10px] w-fit"
                >
                  {isDeleting ? (
                    <Loader2 className="size-3 animate-spin mr-1.5" />
                  ) : (
                    <Trash2 className="size-3 mr-1.5" />
                  )}
                  Remover
                </Button>
              </div>
            ) : null}
          </div>
        )}

        <EmissionParameters control={control} allowSimulated={allowSimulated} />

        <div className="pt-4 border-t space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Configuração de Numeração (
              {environment === 1
                ? 'Produção'
                : environment === 2
                  ? 'Homologação'
                  : 'Simulado'}
              )
            </Label>
            {environment !== 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    code: 1,
                    last_number: 0,
                    original_last_number: 0,
                    next_number: 1,
                    is_active: false,
                    ambient: (environment as 1 | 2 | 3) || 2,
                  })
                }
                className="h-8 rounded-xl font-bold px-4 text-xs"
              >
                <Plus className="size-3.5 mr-1.5" /> Nova Série
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <div className="hidden md:flex gap-2 px-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[60px]">
                Série
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[100px]">
                Últ. Emissão
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[100px]">
                Próximo
              </p>
            </div>

            {fields.map((field, index) => {
              const currentSerie = seriesValues?.[index]
              if (currentSerie?.ambient !== environment) return null

              return (
                <SeriesRow
                  key={field.id}
                  index={index}
                  control={control}
                  onRemove={() => remove(index)}
                  onActivate={() => toggleActive(index)}
                />
              )
            })}

            {!fields.some((_, idx) => seriesValues?.[idx]?.ambient === environment) && (
              <div className="py-8 text-center border-2 border-dashed rounded-2xl border-muted-foreground/10">
                <p className="text-sm text-muted-foreground">
                  Nenhuma série cadastrada para este ambiente.
                </p>
              </div>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground italic ml-1">
            * O próximo DCe emitido usará o número subsequente (Último Número + 1) para
            a série ativa no ambiente selecionado.
          </p>
        </div>
      </div>

      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              Remover Certificado?
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground font-medium">
              Tem certeza que deseja remover este certificado digital?
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Esta ação é{' '}
              <span className="font-bold text-destructive">irreversível</span>. Após a
              remoção, não será possível recuperar o arquivo e você precisará enviá-lo
              novamente para emitir documentos.
            </p>
          </div>
          <DialogFooter className="flex-row gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1 h-11 rounded-xl font-bold"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1 h-11 rounded-xl font-bold"
              onClick={async () => {
                await handleDelete()
                setIsDeleteModalOpen(false)
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="size-4 mr-2" />
              )}
              Sim, remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 border-b bg-muted/20">
            <DialogTitle className="text-lg">Cadastrar Certificado</DialogTitle>
            <DialogDescription>
              Selecione o arquivo .pfx ou .p12 e informe a senha.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                Arquivo do Certificado (A1) *
              </Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pfx,.p12"
                onChange={e => setCertFile(e.target.files?.[0] || null)}
                className="h-11 rounded-xl border-muted-foreground/20 file:mr-4 file:h-7 file:mt-2 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer py-0"
              />
              <p className="text-[10px] text-muted-foreground ml-1 italic">
                Apenas arquivos .pfx ou .p12 são suportados.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                Senha do Certificado *
              </Label>
              <div className="relative group">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                <Input
                  type="password"
                  value={certPass}
                  onChange={e => setCertPass(e.target.value)}
                  autoComplete="new-password"
                  className="h-11 pl-9 rounded-xl border-muted-foreground/20"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 border-t bg-muted/20 flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11 rounded-xl font-bold"
              onClick={() => setIsModalOpen(false)}
              disabled={isUploading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!certFile || !certPass || isUploading}
              className="flex-1 h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md"
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Save className="size-4 mr-2" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
