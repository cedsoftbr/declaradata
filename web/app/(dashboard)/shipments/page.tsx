'use client'

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileSpreadsheet,
  FileStack,
  Loader2,
  Plus,
  Printer,
  Search,
  SendHorizonal,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { useNotifications } from '@/components/providers/notification-provider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PaginationControls } from '@/components/ui/pagination-controls'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CancelShipmentDialog } from '@/features/shipments/components/cancel-shipment-dialog'
import { DeleteShipmentDialog } from '@/features/shipments/components/delete-shipment-dialog'
import { ShipmentRow } from '@/features/shipments/components/shipment-row'
import { useApi } from '@/hooks/use-api'
import {
  type Person,
  personsApi,
  type ShipmentListItem,
  shipmentsApi,
  type User,
} from '@/lib/api'

const STATUS_BADGE: Record<string, string> = {
  draft: 'border-muted-foreground/30 text-muted-foreground bg-muted/30',
  processing: 'border-blue-500/30 text-blue-600 bg-blue-500/5 animate-pulse',
  authorized: 'border-green-500/30 text-green-600 bg-green-500/5',
  cancelling: 'border-blue-500/30 text-blue-600 bg-blue-500/5 animate-pulse',
  cancelled: 'border-red-500/30 text-red-500 bg-red-500/5',
  rejected: 'border-amber-500/40 text-amber-600 bg-amber-500/10 cursor-help',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Emitido',
  processing: 'Emitindo',
  authorized: 'Autorizado',
  cancelling: 'Cancelando',
  cancelled: 'Cancelado',
  rejected: 'Rejeitado',
}

interface ExportStatus {
  ready?: boolean
  state?: string
  error?: string
  detail?: string
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: High complexity due to many filter states and UI interactions
export default function ShipmentsPage() {
  const { call } = useApi()
  const { addNotification } = useNotifications()
  const { accessToken: token } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [emitting, setEmitting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [_exporting, _setExporting] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelShipmentId, setCancelShipmentId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set())
  const [emittingIds, setEmittingIds] = useState<Set<string>>(new Set())
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [userId, setUserId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [emitterFilter, setEmitterFilter] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [ordering, setOrdering] = useState<string>('-created_at')

  const handleSort = (field: string) => {
    setOrdering(prev =>
      prev === field ? `-${field}` : prev === `-${field}` ? '' : field
    )
    setPage(1)
  }

  const { data: usersData } = useQuery({
    queryKey: ['users-list-minimal'],
    queryFn: async () => {
      if (!token) return []
      const res = await call('/api/users/?page_size=1000')
      const json = (await res.json()) as { results?: User[] }
      return json.results ?? []
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutos de cache
  })
  const users = usersData ?? []

  const { data: emittersData } = useQuery({
    queryKey: ['emitters-list-minimal'],
    queryFn: () =>
      token
        ? personsApi.list(token, { is_emitente: true, is_active: true, page_size: 200 })
        : Promise.resolve({
            results: [] as Person[],
            count: 0,
            next: null,
            previous: null,
          }),
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutos de cache
  })
  const emitters = emittersData?.results ?? []
  const { data: usageData } = useQuery({
    queryKey: ['shipments-usage'],
    queryFn: async () => {
      const res = await call('/api/shipments/usage/')
      if (!res.ok) return null
      return res.json() as Promise<{ count: number; limit: number; period: string }>
    },
    enabled: !!token,
    refetchInterval: 30000,
  })
  const isUsageLimitReached = (usageData?.count ?? 0) >= (usageData?.limit ?? Infinity)
  const usageRatio =
    usageData && usageData.limit > 0 ? usageData.count / usageData.limit : 0
  const isUsageNearLimit = usageRatio >= 0.9 && !isUsageLimitReached

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: [
      'shipments',
      page,
      pageSize,
      debouncedSearch,
      userId,
      statusFilter,
      emitterFilter,
      dateRange?.from,
      dateRange?.to,
      ordering,
    ],
    queryFn: async () => {
      const qs = new URLSearchParams()
      qs.set('page', String(page))
      qs.set('page_size', String(pageSize))
      if (debouncedSearch) qs.set('search', debouncedSearch)
      if (userId) qs.set('user', userId)
      if (statusFilter) qs.set('status', statusFilter)
      if (emitterFilter) qs.set('emitter', emitterFilter)
      if (ordering) qs.set('ordering', ordering)
      if (dateRange?.from) qs.set('created_at_after', dateRange.from.toISOString())
      if (dateRange?.to) {
        const b = new Date(dateRange.to)
        b.setHours(23, 59, 59, 999)
        qs.set('created_at_before', b.toISOString())
      }

      const res = await call(`/api/shipments/?${qs.toString()}`)
      return (await res.json()) as { results: ShipmentListItem[]; count: number }
    },
    placeholderData: keepPreviousData,
    refetchInterval: query => {
      const results =
        (query.state.data as { results: ShipmentListItem[] } | undefined)?.results ?? []
      return results.some(s => s.status === 'processing' || s.status === 'cancelling')
        ? 3000
        : false
    },
  })

  const shipments = data?.results ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  const emittableCount = shipments.filter(
    s => selected.has(s.id) && (s.status === 'draft' || s.status === 'rejected')
  ).length
  const printableCount = shipments.filter(
    s => selected.has(s.id) && (s.status === 'authorized' || s.status === 'cancelled')
  ).length

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleSelectAll = () => {
    if (selected.size === shipments.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(shipments.map(s => s.id)))
    }
  }

  const handleBulkEmit = async () => {
    if (isUsageLimitReached) {
      toast.error('Limite mensal atingido. Não é possível transmitir novos DC-e.')
      return
    }
    if (selected.size === 0) return
    const ids = Array.from(selected).filter(id => {
      const s = shipments.find(s => s.id === id)
      return s?.status === 'draft' || s?.status === 'rejected'
    })
    if (ids.length === 0) {
      toast.error(
        'Nenhum documento em emissão ou rejeitado selecionado para transmissão.'
      )
      return
    }
    setEmitting(true)
    setEmittingIds(new Set(ids))

    try {
      const results = await Promise.all(
        ids.map(async id => {
          try {
            const res = await call(`/api/shipments/${id}/emit/`, { method: 'POST' })
            return { id, ok: res.ok }
          } catch {
            return { id, ok: false }
          }
        })
      )

      const successCount = results.filter(r => r.ok).length
      if (successCount > 0) {
        toast.success(`${successCount} documento(s) enviado(s) para processamento.`)
      }
      if (successCount < ids.length) {
        toast.error(`${ids.length - successCount} documento(s) falharam no envio.`)
      }
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      setSelected(new Set())
    } finally {
      setEmitting(false)
      setEmittingIds(new Set())
    }
  }

  const pollBulkPdfStatus = async (taskId: string): Promise<boolean> => {
    for (let i = 0; i < 180; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      const statusRes = await call(`/api/shipments/bulk-pdf/status/?task_id=${taskId}`)
      const statusData = (await statusRes.json().catch(() => ({}))) as ExportStatus

      if (!statusRes.ok || statusData.state === 'FAILURE') {
        throw new Error(statusData.error || statusData.detail || 'Falha ao gerar PDF.')
      }
      if (statusData.ready || statusData.state === 'SUCCESS') return true
    }
    throw new Error('Tempo esgotado ao gerar PDF.')
  }

  const downloadBulkPdf = async (taskId: string) => {
    try {
      const res = await call(`/api/shipments/bulk-pdf/download/?task_id=${taskId}`)
      if (!res.ok) throw new Error('Falha ao baixar PDF.')

      const fileBlob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="?([^";]+)"?/)
      const filename = match?.[1] || 'dce_impressao.pdf'

      const blobUrl = URL.createObjectURL(fileBlob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      toast.error('Não foi possível baixar o PDF.')
    }
  }

  const handleBulkPrint = async () => {
    const selectedPrintable = shipments.filter(
      s => selected.has(s.id) && (s.status === 'authorized' || s.status === 'cancelled')
    )
    if (selectedPrintable.length === 0) {
      toast.error('Nenhum documento disponível para impressão.')
      return
    }

    setPrinting(true)
    try {
      const ids = selectedPrintable.map(s => s.id)
      const startRes = await call(
        `/api/shipments/bulk-pdf/start/?ids=${ids.join(',')}`,
        { method: 'POST' }
      )
      if (!startRes.ok) throw new Error('Falha ao iniciar geração do PDF.')
      const { task_id } = (await startRes.json()) as { task_id?: string }
      if (!task_id) throw new Error('Tarefa de impressão não retornou ID.')

      setPrinting(false)
      toast.info(
        'DACE enviado para geração. Você será notificado quando estiver pronto.',
        {
          position: 'top-center',
          duration: 4000,
        }
      )

      await pollBulkPdfStatus(task_id)

      addNotification({
        title: 'DACE Disponível',
        message: `PDF com ${selectedPrintable.length} documento(s) gerado com sucesso.`,
        action: {
          label: 'Baixar Agora',
          onClick: () => downloadBulkPdf(task_id),
        },
      })

      toast.success('DACE gerado com sucesso!', {
        position: 'top-center',
        duration: 4000,
      })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao preparar impressão em lote.'
      toast.error(msg)
      setPrinting(false)
    }
  }

  const pollExportStatus = async (taskId: string): Promise<boolean> => {
    for (let i = 0; i < 180; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      const statusRes = await call(
        `/api/shipments/export-xlsx/status/?task_id=${taskId}`
      )
      const statusData = (await statusRes.json().catch(() => ({}))) as ExportStatus

      if (!statusRes.ok || statusData.state === 'FAILURE') {
        throw new Error(
          statusData.error || statusData.detail || 'Falha ao processar exportação XLSX.'
        )
      }
      if (statusData.ready || statusData.state === 'SUCCESS') return true
    }
    throw new Error('Tempo esgotado ao gerar exportação.')
  }

  const downloadXlsx = async (taskId: string) => {
    try {
      const res = await call(`/api/shipments/export-xlsx/download/?task_id=${taskId}`)
      if (!res.ok) throw new Error('Falha ao baixar XLSX.')

      const fileBlob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="?([^";]+)"?/)
      const filename = match?.[1] || 'dce_relatorio.xlsx'

      const blobUrl = URL.createObjectURL(fileBlob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      toast.error('Não foi possível baixar o XLSX.')
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles complex polling and download flow
  const handleExportXlsx = async () => {
    toast.info('Solicitando geração do relatório...', {
      position: 'top-center',
      duration: 3000,
    })

    try {
      const qs = new URLSearchParams()
      if (debouncedSearch) qs.set('search', debouncedSearch)
      qs.set('page', String(page))
      qs.set('page_size', String(pageSize))
      if (userId) qs.set('user', userId)
      if (statusFilter) qs.set('status', statusFilter)
      if (emitterFilter) qs.set('emitter', emitterFilter)
      if (dateRange?.from) qs.set('created_at_after', dateRange.from.toISOString())
      if (dateRange?.to) {
        const b = new Date(dateRange.to)
        b.setHours(23, 59, 59, 999)
        qs.set('created_at_before', b.toISOString())
      }

      const startRes = await call(
        `/api/shipments/export-xlsx/start/?${qs.toString()}`,
        { method: 'POST' }
      )
      if (!startRes.ok) throw new Error('Falha ao iniciar exportação XLSX.')
      const { task_id } = (await startRes.json()) as { task_id?: string }
      if (!task_id) throw new Error('Tarefa de exportação não retornou ID.')

      await pollExportStatus(task_id)

      addNotification({
        title: 'Relatório Disponível',
        message: 'O relatório XLSX solicitado foi gerado com sucesso.',
        action: {
          label: 'Baixar Agora',
          onClick: () => downloadXlsx(task_id),
        },
      })

      toast.success('Relatório gerado com sucesso!', {
        position: 'top-center',
        duration: 4000,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao exportar relatório.'
      toast.error(msg, {
        position: 'top-center',
      })
    }
  }

  const handleRemove = (id: string) => {
    setDeleteId(id)
  }

  const handleConfirmDelete = async () => {
    if (!deleteId || !token) return
    setDeleteLoading(true)
    try {
      await shipmentsApi.delete(token, deleteId)
      toast.success('Emissão excluída.')
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      setDeleteId(null)
    } catch {
      toast.error('Erro ao excluir emissão.')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleCancel = (id: string) => {
    setCancelShipmentId(id)
    setCancelReason('')
    setCancelOpen(true)
  }

  const confirmCancel = async () => {
    if (!token || !cancelShipmentId) return
    if (cancelReason.trim().length < 15) {
      toast.error('A justificativa deve ter pelo menos 15 caracteres.')
      return
    }
    const id = cancelShipmentId
    setCancelLoading(true)
    setCancellingIds(prev => new Set(prev).add(id))

    try {
      const res = await call(`/api/shipments/${id}/cancel/`, {
        method: 'POST',
        body: JSON.stringify({ justificativa: cancelReason }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao cancelar.')
      }
      toast.success('Solicitação de cancelamento enviada.')
      setCancelOpen(false)
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar.')
    } finally {
      setCancelLoading(false)
      setCancellingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleSearchChange = (val: string) => {
    setSearch(val)
  }

  const handleDuplicate = (id: string) => {
    router.push(`/shipments/new?from=${id}`)
  }

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setUserId('')
    setStatusFilter('')
    setEmitterFilter('')
    setDateRange(undefined)
    setPage(1)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {(isUsageLimitReached || isUsageNearLimit) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            isUsageLimitReached
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-700'
          }`}
        >
          {isUsageLimitReached
            ? `Limite mensal de DC-e atingido (${usageData?.count}/${usageData?.limit}).`
            : `Atenção: consumo de DC-e próximo do limite (${usageData?.count}/${usageData?.limit}).`}
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">DCe</h1>
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <div className="flex items-center gap-2 mr-2 animate-in slide-in-from-right-4">
              {printableCount > 0 && (
                <Button
                  variant="outline"
                  onClick={handleBulkPrint}
                  disabled={printing}
                  className="h-11 rounded-xl font-bold px-6 border-primary/20 hover:bg-primary/5 text-primary shadow-md"
                >
                  {printing ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <Printer className="size-4 mr-2" />
                  )}
                  Imprimir DACE ({printableCount})
                </Button>
              )}
              {emittableCount > 0 && (
                <Button
                  onClick={handleBulkEmit}
                  disabled={emitting || isUsageLimitReached}
                  title={
                    isUsageLimitReached
                      ? 'Limite mensal atingido. Não é possível transmitir novos DC-e.'
                      : undefined
                  }
                  className="h-11 rounded-xl font-bold px-6 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                >
                  {emitting ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <SendHorizonal className="size-4 mr-2" />
                  )}
                  Transmitir ({emittableCount})
                </Button>
              )}
            </div>
          )}
          <Button
            onClick={() => router.push('/shipments/new')}
            disabled={isUsageLimitReached}
            title={
              isUsageLimitReached
                ? 'Limite mensal atingido. Não é possível criar nova emissão.'
                : undefined
            }
            className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md px-6"
          >
            <Plus className="size-5 mr-2" />
            Nova Emissão
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Buscar por número, tomador ou motorista..."
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              className="pl-9 h-10 border shadow-sm rounded-xl focus-visible:ring-primary/20"
            />
          </div>

          <div className="w-[240px]">
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              placeholder="Filtrar por período"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="w-[180px]">
            <NativeSelect
              value={userId}
              onChange={e => {
                setUserId(e.target.value)
                setPage(1)
              }}
              className="h-10 text-xs rounded-xl border shadow-sm"
            >
              <NativeSelectOption value="">Todos usuários</NativeSelectOption>
              {users.map(u => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.first_name} {u.last_name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="w-[180px]">
            <NativeSelect
              value={emitterFilter}
              onChange={e => {
                setEmitterFilter(e.target.value)
                setPage(1)
              }}
              className="h-10 text-xs rounded-xl border shadow-sm"
            >
              <NativeSelectOption value="">Todos emitentes</NativeSelectOption>
              {emitters.map(e => (
                <NativeSelectOption key={e.id} value={e.id}>
                  {e.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="w-[150px]">
            <NativeSelect
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="h-10 text-xs rounded-xl border shadow-sm"
            >
              <NativeSelectOption value="">Todos status</NativeSelectOption>
              <NativeSelectOption value="authorized">Autorizado</NativeSelectOption>
              <NativeSelectOption value="cancelled">Cancelado</NativeSelectOption>
              <NativeSelectOption value="rejected">Rejeitado</NativeSelectOption>
            </NativeSelect>
          </div>

          <Button
            variant="outline"
            onClick={handleExportXlsx}
            className="h-10 px-3 text-xs font-bold rounded-xl border shadow-sm text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
            title="Exportar XLSX"
          >
            <FileSpreadsheet className="size-4 mr-2" />
            Excel
          </Button>

          {(userId || dateRange || statusFilter || emitterFilter) && (
            <Button
              variant="ghost"
              onClick={clearFilters}
              className="h-10 text-xs font-bold text-muted-foreground hover:text-primary rounded-xl"
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card border rounded-2xl shadow-sm overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className="w-[40px] px-4">
                <Checkbox
                  checked={selected.size === shipments.length && shipments.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              {(
                [
                  ['number', 'Número'],
                  ['dh_emi', 'Data'],
                  ['emitter__name', 'Emitente'],
                  [null, 'Remetente'],
                  ['recipient__name', 'Destinatário'],
                  ['status', 'Status'],
                ] as [string | null, string][]
              ).map(([field, label]) => (
                <TableHead
                  key={label}
                  className="font-bold text-xs uppercase tracking-wider text-muted-foreground py-4"
                >
                  {field ? (
                    <button
                      type="button"
                      onClick={() => handleSort(field)}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {label}
                      {ordering === field ? (
                        <ArrowUp className="size-3" />
                      ) : ordering === `-${field}` ? (
                        <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    label
                  )}
                </TableHead>
              ))}
              <TableHead className="w-[100px] py-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Skeleton loading state
                <TableRow key={i}>
                  <TableCell colSpan={8} className="h-16">
                    <div className="flex items-center gap-4 px-2">
                      <div className="size-4 bg-muted animate-pulse rounded" />
                      <div className="h-4 bg-muted animate-pulse rounded w-24" />
                      <div className="h-4 bg-muted animate-pulse rounded w-16" />
                      <div className="h-4 bg-muted animate-pulse rounded flex-1" />
                      <div className="h-4 bg-muted animate-pulse rounded w-20" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : shipments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="size-16 bg-muted/50 rounded-full flex items-center justify-center">
                      <FileStack className="size-8 text-muted-foreground/50" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-foreground font-bold">
                        Nenhuma emissão encontrada
                      </p>
                      <p className="text-muted-foreground text-sm">
                        Tente ajustar seus filtros ou faça uma busca diferente.
                      </p>
                    </div>
                    {(debouncedSearch || userId || statusFilter || dateRange) && (
                      <Button
                        variant="link"
                        onClick={clearFilters}
                        className="text-primary font-bold"
                      >
                        Limpar todos os filtros
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              shipments.map(s => (
                <ShipmentRow
                  key={s.id}
                  shipment={s}
                  isSelected={selected.has(s.id)}
                  onToggleSelect={toggleSelect}
                  onRemove={handleRemove}
                  onCancel={handleCancel}
                  onNavigate={id => {
                    const s = shipments.find(s => s.id === id)
                    const isEditable = s?.status === 'draft' || s?.status === 'rejected'
                    router.push(
                      isEditable ? `/shipments/${id}/edit` : `/shipments/${id}`
                    )
                  }}
                  onEmit={async id => {
                    if (isUsageLimitReached) {
                      toast.error(
                        'Limite mensal atingido. Não é possível transmitir novos DC-e.'
                      )
                      return
                    }
                    setEmittingIds(prev => new Set(prev).add(id))
                    try {
                      const res = await call(`/api/shipments/${id}/emit/`, {
                        method: 'POST',
                      })
                      if (res.ok) {
                        toast.success('Documento enviado para processamento.')
                      } else {
                        toast.error('Erro ao enviar documento.')
                      }
                      queryClient.invalidateQueries({ queryKey: ['shipments'] })
                    } finally {
                      setEmittingIds(prev => {
                        const next = new Set(prev)
                        next.delete(id)
                        return next
                      })
                    }
                  }}
                  onDownloadPdf={async id => {
                    try {
                      const res = await call(`/api/shipments/${id}/pdf/`)
                      if (!res.ok) throw new Error()
                      const blob = await res.blob()
                      const url = URL.createObjectURL(blob)
                      window.open(url, '_blank')
                    } catch {
                      toast.error('Erro ao baixar PDF.')
                    }
                  }}
                  onDownloadXml={async id => {
                    try {
                      const res = await call(`/api/shipments/${id}/xml/`)
                      if (!res.ok) throw new Error()
                      const blob = await res.blob()
                      const disposition = res.headers.get('Content-Disposition') ?? ''
                      const match = disposition.match(/filename="([^"]+)"/)
                      const filename = match?.[1] ?? `DCe_${id}.xml`
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = filename
                      a.click()
                    } catch {
                      toast.error('Erro ao baixar XML.')
                    }
                  }}
                  onDuplicate={handleDuplicate}
                  isCancelling={cancellingIds.has(s.id)}
                  isEmitting={emittingIds.has(s.id)}
                  disableEmit={isUsageLimitReached}
                  statusBadge={STATUS_BADGE}
                  statusLabel={STATUS_LABEL}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        totalCount={totalCount}
        isFetching={isLoading}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <CancelShipmentDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={confirmCancel}
        isLoading={cancelLoading}
        reason={cancelReason}
        onReasonChange={setCancelReason}
      />

      <DeleteShipmentDialog
        open={!!deleteId}
        onOpenChange={open => !open && setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        isLoading={deleteLoading}
      />
    </div>
  )
}
