'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApi } from '@/hooks/use-api'

interface Plan {
  id: string
  name: string
  monthly_dce_limit: number
  active_user_limit: number
  price: string
  is_active: boolean
}

export default function PlansPage() {
  const router = useRouter()
  const { call } = useApi()
  const queryClient = useQueryClient()
  const { user: me, isInitializing, isAuthenticated } = useAuth()
  const isSuperAdmin = me?.profile === 'superadmin'

  useEffect(() => {
    if (!isInitializing && me && !isSuperAdmin) router.push('/')
  }, [isInitializing, me, isSuperAdmin, router])

  const { data, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await call('/api/billing/plans?page_size=100')
      if (!res.ok) throw new Error()
      return res.json() as Promise<{ results: Plan[] }>
    },
    enabled: !!me && isSuperAdmin,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await call(`/api/billing/plans/${id}/`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      toast.success('Plano excluído.')
    },
    onError: () => toast.error('Não foi possível excluir o plano.'),
  })

  if (isInitializing || (!me && isAuthenticated) || !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="size-8 text-muted-foreground animate-spin" />
      </div>
    )
  }

  const plans = data?.results ?? []

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <CreditCard className="size-6 text-muted-foreground" />
          Planos
        </h1>
        <Button
          onClick={() => router.push('/billing/plans/new')}
          className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md"
        >
          <Plus className="size-4 mr-2" />
          Novo Plano
        </Button>
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
                <TableHead className="font-bold py-4">Nome</TableHead>
                <TableHead className="font-bold py-4">DC-e/mês</TableHead>
                <TableHead className="font-bold py-4">Usuários</TableHead>
                <TableHead className="font-bold py-4">Preço</TableHead>
                <TableHead className="font-bold py-4">Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map(plan => (
                <TableRow key={plan.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>
                    {plan.monthly_dce_limit.toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell>{plan.active_user_limit}</TableCell>
                  <TableCell className="font-mono">
                    R${' '}
                    {Number(plan.price).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        plan.is_active
                          ? 'border-green-500/30 text-green-600 bg-green-500/5'
                          : 'border-muted-foreground/20 text-muted-foreground bg-muted/20'
                      }
                    >
                      {plan.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/billing/plans/${plan.id}/edit`)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(plan.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {plans.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-16"
                  >
                    Nenhum plano cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
