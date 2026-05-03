'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Loader2, Plus, RefreshCw, Tags, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { PaginationControls } from '@/components/ui/pagination-controls'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { NcmCatalogEntry } from '@/features/ncm-catalog/api'
import { NcmImportModal } from '@/features/ncm-catalog/components/ncm-import-modal'
import { useApi } from '@/hooks/use-api'

export function NcmCatalogClient() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { call } = useApi()
  const { user, isInitializing, isAuthenticated } = useAuth()

  const isSuperAdmin = !!(
    user?.is_staff ||
    user?.is_superuser ||
    user?.profile === 'superadmin'
  )

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['ncm-catalog', page, pageSize],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (page > 1) qs.set('page', String(page))
      qs.set('page_size', String(pageSize))
      const res = await call(`/api/products/ncm-catalog/?${qs}`)
      if (!res.ok) throw new Error('Erro ao carregar catálogo de NCM')
      return res.json() as Promise<{
        count: number
        next: string | null
        previous: string | null
        results: NcmCatalogEntry[]
      }>
    },
    enabled: !!user && isSuperAdmin,
  })

  useEffect(() => {
    if (error) toast.error('Erro ao carregar catálogo de NCM')
  }, [error])

  useEffect(() => {
    if (!isInitializing && user && !isSuperAdmin) {
      router.push('/')
    }
  }, [isInitializing, user, isSuperAdmin, router])

  if (isInitializing || (!user && isAuthenticated) || !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="size-8 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
      </div>
    )
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await call(`/api/products/ncm-catalog/${id}/`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('NCM removido do catálogo')
      await queryClient.invalidateQueries({ queryKey: ['ncm-catalog'] })
    } catch {
      toast.error('Erro ao remover NCM')
    } finally {
      setDeletingId(null)
    }
  }

  const entries = data?.results ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Tags className="size-6 text-muted-foreground" />
          NCM
          {isFetching && !isLoading && (
            <RefreshCw className="size-4 animate-spin text-muted-foreground/40" />
          )}
        </h1>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="h-11 px-6 rounded-xl font-bold"
          >
            <FileSpreadsheet className="size-4 mr-2" />
            Importar
          </Button>

          <Button
            onClick={() => router.push('/catalog/new')}
            className="h-11 px-6 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold"
          >
            <Plus className="size-4 mr-2" />
            Adicionar NCM
          </Button>
        </div>
      </div>

      <NcmImportModal
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        onSuccess={() => {
          setPage(1)
          refetch()
        }}
      />

      <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
        <div className="rounded-xl border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider">
                  NCM
                </TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider">
                  Data de Cadastro
                </TableHead>
                <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(entry => (
                <TableRow
                  key={entry.id}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <TableCell className="font-mono font-medium">{entry.ncm}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={deletingId === entry.id}
                      onClick={() => handleDelete(entry.id)}
                      className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                    >
                      {deletingId === entry.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    Nenhum NCM encontrado no catálogo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <PaginationControls
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalCount={totalCount}
          isFetching={isFetching}
          onPageChange={setPage}
          onPageSizeChange={size => {
            setPageSize(size)
            setPage(1)
          }}
        />
      </div>
    </div>
  )
}
