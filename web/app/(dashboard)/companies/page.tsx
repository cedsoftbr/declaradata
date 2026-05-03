'use client'

import { useQuery } from '@tanstack/react-query'
import { Building2, FilterX, Loader2, Pencil, Plus, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

interface Company {
  id: number
  name: string
  trade_name: string | null
  cnpj: string
  is_active: boolean
  created_at: string
}

export default function CompaniesPage() {
  const router = useRouter()
  const { call } = useApi()
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 400)
  }

  const { user: me, isInitializing, isAuthenticated } = useAuth()
  const isSuperAdmin = me?.profile === 'superadmin'

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['companies', debouncedSearch, activeFilter, page, pageSize],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (debouncedSearch) qs.set('search', debouncedSearch)
      if (activeFilter === 'active') qs.set('is_active', 'true')
      if (activeFilter === 'inactive') qs.set('is_active', 'false')
      if (page > 1) qs.set('page', String(page))
      qs.set('page_size', String(pageSize))
      const res = await call(`/api/companies?${qs}`)
      if (!res.ok) throw new Error('Não foi possível carregar as empresas.')
      return res.json() as Promise<{
        count: number
        next: string | null
        previous: string | null
        results: Company[]
      }>
    },
    enabled: !!me && isSuperAdmin,
  })

  useEffect(() => {
    if (error) toast.error('Não foi possível carregar as empresas.')
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

  const companies = data?.results ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  if (isLoading && companies.length === 0) {
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
          <Building2 className="size-6 text-muted-foreground" />
          Empresas
        </h1>
        <Button
          onClick={() => router.push('/companies/new')}
          className="h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold shadow-md"
        >
          <Plus className="size-4 mr-2" />
          Nova Empresa
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:max-w-sm group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Buscar por nome ou documento..."
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9 h-10 border shadow-sm rounded-xl"
          />
        </div>

        <NativeSelect
          value={activeFilter}
          onChange={e => {
            setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')
            setPage(1)
          }}
          wrapperClassName="w-36 flex-none"
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </NativeSelect>

        {(searchTerm || activeFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              handleSearchChange('')
              setActiveFilter('all')
            }}
            className="h-10 px-3 text-muted-foreground"
          >
            <FilterX className="size-4 mr-2" /> Limpar
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div className="text-xs text-muted-foreground px-1 font-medium uppercase tracking-wider">
          {totalCount} empresa{totalCount !== 1 ? 's' : ''}
        </div>

        <div className="rounded-xl border bg-card shadow-sm overflow-hidden relative">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-bold py-4">Nome / Razão Social</TableHead>
                <TableHead className="font-bold py-4">Documento</TableHead>
                <TableHead className="font-bold py-4">Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map(company => (
                <TableRow
                  key={company.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <TableCell className="font-medium text-sm">
                    <div className="flex flex-col">
                      <span>{company.name}</span>
                      {company.trade_name && (
                        <span className="text-[10px] text-muted-foreground">
                          {company.trade_name}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {company.cnpj}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        company.is_active
                          ? 'border-green-500/30 text-green-600 bg-green-500/5'
                          : 'border-muted-foreground/20 text-muted-foreground bg-muted/20'
                      }
                    >
                      {company.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push(`/companies/${company.id}/edit`)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {companies.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground py-16"
                  >
                    <Search className="size-8 opacity-20 mx-auto mb-2" />
                    <p>Nenhuma empresa encontrada.</p>
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
