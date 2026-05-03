'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Receipt, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { PaginationControls } from '@/components/ui/pagination-controls'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApi } from '@/hooks/use-api'

const MONTH_NAMES = [
  '',
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
}

const STATUS_CLASSES: Record<string, string> = {
  pending: 'border-yellow-500/30 text-yellow-600 bg-yellow-500/5',
  paid: 'border-green-500/30 text-green-600 bg-green-500/5',
  overdue: 'border-red-500/30 text-red-600 bg-red-500/5',
  cancelled: 'border-muted-foreground/20 text-muted-foreground bg-muted/20',
}

interface Invoice {
  id: string
  company: string
  company_name: string
  plan_name: string
  amount: string
  year: number
  month: number
  status: string
  due_date: string
  paid_at: string | null
}

export default function InvoicesPage() {
  const router = useRouter()
  const { call } = useApi()
  const queryClient = useQueryClient()
  const { user: me, isInitializing, isAuthenticated } = useAuth()
  const isSuperAdmin = me?.profile === 'superadmin'

  const today = new Date()
  const [statusFilter, setStatusFilter] = useState('')
  const [yearFilter, setYearFilter] = useState(String(today.getFullYear()))
  const [monthFilter, setMonthFilter] = useState(String(today.getMonth() + 1))
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)

  useEffect(() => {
    if (!isInitializing && me && !isSuperAdmin) router.push('/')
  }, [isInitializing, me, isSuperAdmin, router])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['invoices', statusFilter, yearFilter, monthFilter, page],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (statusFilter) qs.set('status', statusFilter)
      if (yearFilter) qs.set('year', yearFilter)
      if (monthFilter) qs.set('month', monthFilter)
      qs.set('page', String(page))
      qs.set('page_size', String(pageSize))
      const res = await call(`/api/billing/invoices?${qs}`)
      if (!res.ok) throw new Error()
      return res.json() as Promise<{ count: number; results: Invoice[] }>
    },
    enabled: !!me && isSuperAdmin,
  })

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await call('/api/billing/invoices/generate/', { method: 'POST' })
      if (!res.ok) throw new Error()
      return res.json() as Promise<{ created: number }>
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success(`${data.created} fatura(s) gerada(s).`)
    },
    onError: () => toast.error('Erro ao gerar faturas.'),
  })

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await call(`/api/billing/invoices/${id}/mark-paid/`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Fatura marcada como paga.')
    },
    onError: () => toast.error('Não foi possível atualizar a fatura.'),
  })

  if (isInitializing || (!me && isAuthenticated) || !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="size-8 text-muted-foreground animate-spin" />
      </div>
    )
  }

  const invoices = data?.results ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i)

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <Receipt className="size-6 text-muted-foreground" />
          Faturas
        </h1>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md"
        >
          {generateMutation.isPending ? (
            <Loader2 className="size-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="size-4 mr-2" />
          )}
          Gerar Faturas
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          value={yearFilter}
          onChange={e => {
            setYearFilter(e.target.value)
            setPage(1)
          }}
          wrapperClassName="w-28 flex-none"
        >
          {years.map(y => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          value={monthFilter}
          onChange={e => {
            setMonthFilter(e.target.value)
            setPage(1)
          }}
          wrapperClassName="w-28 flex-none"
        >
          <option value="">Todos os meses</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>
              {MONTH_NAMES[m]}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          value={statusFilter}
          onChange={e => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          wrapperClassName="w-36 flex-none"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-3">
        <div className="text-xs text-muted-foreground px-1 font-medium uppercase tracking-wider">
          {totalCount} fatura{totalCount !== 1 ? 's' : ''}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-bold py-4">Empresa</TableHead>
                  <TableHead className="font-bold py-4">Plano</TableHead>
                  <TableHead className="font-bold py-4">Período</TableHead>
                  <TableHead className="font-bold py-4">Valor</TableHead>
                  <TableHead className="font-bold py-4">Vencimento</TableHead>
                  <TableHead className="font-bold py-4">Status</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(inv => (
                  <TableRow
                    key={inv.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-medium text-sm">
                      {inv.company_name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inv.plan_name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {MONTH_NAMES[inv.month]}/{inv.year}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      R${' '}
                      {Number(inv.amount).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(`${inv.due_date}T00:00:00`).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_CLASSES[inv.status] ?? ''}
                      >
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.status === 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-xs"
                          disabled={markPaidMutation.isPending}
                          onClick={() => markPaidMutation.mutate(inv.id)}
                        >
                          Marcar pago
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-16"
                    >
                      Nenhuma fatura encontrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationControls
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalCount={totalCount}
          isFetching={isFetching}
          onPageChange={setPage}
          onPageSizeChange={() => {}}
        />
      </div>
    </div>
  )
}
