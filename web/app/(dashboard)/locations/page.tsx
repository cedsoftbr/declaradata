'use client'

import { useQuery } from '@tanstack/react-query'
import {
  FileSpreadsheet,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
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
import type { City } from '@/features/locations/api'
import { CityImportModal } from '@/features/locations/components/city-import-modal'
import { useApi } from '@/hooks/use-api'

export default function LocationsPage() {
  const { call } = useApi()
  const { user: me, isInitializing, isAuthenticated } = useAuth()
  const router = useRouter()

  const isSuperAdmin = me?.profile === 'superadmin'

  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 400)
  }

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['cities', debouncedSearch, page, pageSize],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (debouncedSearch) qs.set('search', debouncedSearch)
      if (page > 1) qs.set('page', String(page))
      qs.set('page_size', String(pageSize))
      const res = await call(`/api/locations/cities?${qs}`)
      if (!res.ok) throw new Error('Não foi possível carregar as cidades.')
      return res.json() as Promise<{
        count: number
        next: string | null
        previous: string | null
        results: City[]
      }>
    },
    enabled: !!me && isSuperAdmin,
  })

  useEffect(() => {
    if (error) toast.error('Erro ao carregar cidades')
  }, [error])

  useEffect(() => {
    if (!isInitializing && me && !isSuperAdmin) {
      router.push('/')
    }
  }, [isInitializing, me, isSuperAdmin, router])

  if (isInitializing || (!me && isAuthenticated) || !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="size-8 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
      </div>
    )
  }

  const cities = data?.results ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  if (isLoading && cities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="size-8 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <MapPin className="size-6 text-muted-foreground" />
          Cidades
          {isFetching && !isLoading && (
            <RefreshCw className="size-4 text-muted-foreground/40 animate-spin ml-1" />
          )}
        </h1>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setIsImportModalOpen(true)}
            variant="outline"
            className="md:w-auto w-full shadow-sm h-11 px-6 rounded-xl font-bold transition-all"
          >
            <FileSpreadsheet className="size-4 mr-2" />
            Importar
          </Button>
          <Button
            onClick={() => router.push('/locations/new')}
            className="md:w-auto w-full shadow-md bg-foreground text-background hover:bg-foreground/90 font-bold h-11 px-6 rounded-xl transition-all"
          >
            <Plus className="size-4 mr-2" />
            Nova Cidade
          </Button>
        </div>
      </div>

      <CityImportModal
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        onSuccess={() => {
          setPage(1)
          refetch()
        }}
      />

      <div className="relative w-full sm:max-w-sm group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <Input
          value={searchTerm}
          onChange={e => handleSearchChange(e.target.value)}
          className="pl-9 h-10 border shadow-sm rounded-xl"
        />
      </div>

      <div className="space-y-3">
        <div className="text-xs text-muted-foreground px-1 font-medium uppercase tracking-wider">
          {totalCount > 0
            ? `${totalCount} cidade${totalCount !== 1 ? 's' : ''} encontrada${totalCount !== 1 ? 's' : ''}`
            : 'Nenhuma cidade encontrada'}
        </div>

        <div className="rounded-xl border bg-card shadow-sm overflow-hidden relative">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-bold py-4">Nome</TableHead>
                <TableHead className="font-bold py-4">UF</TableHead>
                <TableHead className="font-bold py-4 text-right">Código IBGE</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cities.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground py-16"
                  >
                    <Search className="size-8 opacity-20 mx-auto mb-2" />
                    <p>Nenhuma cidade encontrada.</p>
                  </TableCell>
                </TableRow>
              ) : (
                cities.map(city => (
                  <TableRow
                    key={city.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-medium text-sm">{city.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {city.uf}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {city.ibge_code}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/locations/${city.id}/edit`)}
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
