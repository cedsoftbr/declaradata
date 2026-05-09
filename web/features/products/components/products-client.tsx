'use client'

import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileSpreadsheet,
  FilterX,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import type { Product } from '@/lib/api'
import { ProductImportModal } from './product-import-modal'

export function ProductsClient() {
  const router = useRouter()
  const { call } = useApi()

  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [ordering, setOrdering] = useState<string>('descricao')

  const handleSort = (field: string) => {
    setOrdering(prev =>
      prev === field ? `-${field}` : prev === `-${field}` ? '' : field
    )
    setPage(1)
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 400)
  }

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['products', debouncedSearch, page, pageSize, ordering],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (debouncedSearch) qs.set('search', debouncedSearch)
      if (ordering) qs.set('ordering', ordering)
      if (page > 1) qs.set('page', String(page))
      qs.set('page_size', String(pageSize))
      const res = await call(`/api/products/?${qs}`)
      if (!res.ok) throw new Error('Erro ao carregar produtos')
      return res.json() as Promise<{
        count: number
        next: string | null
        previous: string | null
        results: Product[]
      }>
    },
  })

  useEffect(() => {
    if (error) toast.error('Erro ao carregar produtos')
  }, [error])

  const products = data?.results ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          Produtos
          {isFetching && !isLoading && (
            <RefreshCw className="size-4 animate-spin text-muted-foreground/40" />
          )}
        </h1>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setIsImportModalOpen(true)}
            variant="outline"
            className="md:w-auto w-full shadow-sm h-11 px-6 rounded-xl font-bold transition-all"
          >
            <FileSpreadsheet className="size-4 mr-2" /> Importar
          </Button>
          <Button
            onClick={() => router.push('/products/new')}
            className="md:w-auto w-full shadow-md bg-foreground text-background hover:bg-foreground/90 font-bold h-11 px-6 rounded-xl transition-all"
          >
            <Plus className="size-4 mr-2" /> Novo Produto
          </Button>
        </div>
      </div>

      <ProductImportModal
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        onSuccess={() => {
          setPage(1)
          refetchProducts()
        }}
      />

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:max-w-sm group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9 pr-8 h-10 border shadow-sm rounded-xl"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <FilterX className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs text-muted-foreground px-1 font-medium uppercase tracking-wider">
          {totalCount} produto{totalCount !== 1 ? 's' : ''}
        </div>

        <div className="rounded-xl border bg-card shadow-sm overflow-hidden relative">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                {(
                  [
                    ['descricao', 'Descrição'],
                    ['ncm', 'NCM'],
                  ] as [string, string][]
                ).map(([field, label]) => (
                  <TableHead
                    key={field}
                    className={`font-bold py-4${field === 'ncm' ? ' text-right' : ''}`}
                  >
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
                  </TableHead>
                ))}
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-16">
                    <Loader2 className="size-6 animate-spin text-muted-foreground/50 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground py-16"
                  >
                    <Search className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p>Nenhum produto encontrado.</p>
                  </TableCell>
                </TableRow>
              ) : (
                products.map(product => (
                  <TableRow
                    key={product.id}
                    className="hover:bg-muted/50 transition-colors group"
                  >
                    <TableCell className="text-sm font-medium">
                      {product.descricao}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground font-mono">
                      {product.ncm}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/products/${product.id}/edit`)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
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
