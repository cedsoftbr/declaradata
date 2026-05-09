'use client'

import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FilterX,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
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
import type { User } from '@/features/users/api'
import { useApi } from '@/hooks/use-api'

interface Company {
  id: number
  name: string
  trade_name: string | null
}

interface UserRowProps {
  user: User
  isSuperAdmin: boolean
  onEdit: (u: User) => void
}

function formatLastAccess(value?: string | null) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('pt-BR')
}

function UserTableRow({ user: u, isSuperAdmin, onEdit }: UserRowProps) {
  return (
    <TableRow key={u.id} className="hover:bg-muted/50 transition-colors">
      <TableCell>
        <span className="font-medium text-sm">
          {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}` : '—'}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">{u.email}</span>
      </TableCell>
      {isSuperAdmin && (
        <TableCell>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {u.company_name || 'Sistema'}
          </span>
        </TableCell>
      )}
      <TableCell>
        <div className="flex items-center gap-2">
          {u.profile === 'superadmin' || u.is_superuser || u.is_staff ? (
            <Badge
              variant="secondary"
              className="text-[10px] uppercase bg-blue-500/10 text-blue-600 border-blue-500/20"
            >
              Superadmin
            </Badge>
          ) : u.profile === 'admin' ? (
            <Badge
              variant="outline"
              className="text-[10px] uppercase border-foreground/30 text-foreground bg-foreground/5 font-bold tracking-wider"
            >
              Admin
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] uppercase">
              Emissor
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Badge
          variant="outline"
          className={
            u.is_active
              ? 'border-green-500/30 text-green-600 bg-green-500/5'
              : 'border-red-500/30 text-red-500 bg-red-500/5'
          }
        >
          {u.is_active ? 'Ativo' : 'Inativo'}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground text-right">
        {formatLastAccess(u.last_login)}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" onClick={() => onEdit(u)}>
          <Pencil className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Handles multiple filters and dashboard logic
export default function UsersPage() {
  const { call } = useApi()
  const { user: me, isInitializing, isAuthenticated } = useAuth()
  const router = useRouter()

  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>(
    'active'
  )
  const [companyFilter, setCompanyFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'superadmin' | 'admin' | 'emissor'
  >('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [ordering, setOrdering] = useState<string>('email')

  const handleSort = (field: string) => {
    setOrdering(prev =>
      prev === field ? `-${field}` : prev === `-${field}` ? '' : field
    )
    setPage(1)
  }

  const isSuperAdmin = me?.profile === 'superadmin'
  const canAccessUsers =
    isSuperAdmin || me?.profile === 'admin' || me?.is_staff || me?.is_superuser

  const { data: companiesData } = useQuery({
    queryKey: ['companies', 'list'],
    queryFn: async () => {
      const res = await call('/api/companies/?page_size=1000')
      if (!res.ok) throw new Error('Erro ao carregar empresas')
      return res.json() as Promise<{ results: Company[] }>
    },
    enabled: isSuperAdmin,
  })

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 400)
  }

  const setTypeFilters = (qs: URLSearchParams) => {
    if (typeFilter !== 'all') {
      qs.set('profile', typeFilter)
    }
  }

  const buildUserQueryString = () => {
    const qs = new URLSearchParams()
    if (debouncedSearch) qs.set('search', debouncedSearch)
    if (companyFilter) qs.set('company', companyFilter)

    if (activeFilter === 'active') qs.set('is_active', 'true')
    if (activeFilter === 'inactive') qs.set('is_active', 'false')

    setTypeFilters(qs)

    if (ordering) qs.set('ordering', ordering)
    if (page > 1) qs.set('page', String(page))
    qs.set('page_size', String(pageSize))
    return qs.toString()
  }

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: [
      'users',
      debouncedSearch,
      activeFilter,
      companyFilter,
      typeFilter,
      page,
      pageSize,
      ordering,
    ],
    queryFn: async () => {
      const queryString = buildUserQueryString()
      const res = await call(`/api/users/?${queryString}`)
      if (!res.ok) throw new Error('Erro ao carregar usuários')
      return res.json() as Promise<{
        count: number
        next: string | null
        previous: string | null
        results: User[]
      }>
    },
  })

  useEffect(() => {
    if (error) toast.error('Erro ao carregar usuários')
  }, [error])

  useEffect(() => {
    if (!isInitializing && me && !canAccessUsers) {
      router.push('/')
    }
  }, [isInitializing, me, canAccessUsers, router])

  if (isInitializing || (!me && isAuthenticated) || !canAccessUsers) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="size-8 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
      </div>
    )
  }

  const users = data?.results ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  if (isLoading && users.length === 0) {
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
          <Users className="size-6 text-muted-foreground" />
          Usuários
          {isFetching && !isLoading && (
            <RefreshCw className="size-4 text-muted-foreground/40 animate-spin ml-1" />
          )}
        </h1>
        <Button
          onClick={() => router.push('/users/new')}
          className="shadow-md bg-foreground text-background hover:bg-foreground/90 font-bold h-11 px-6 rounded-xl transition-all"
        >
          <Plus className="size-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 flex-wrap">
        <div className="relative w-full sm:max-w-sm group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9 h-10 border shadow-sm"
          />
        </div>

        <NativeSelect
          value={activeFilter}
          onChange={e => {
            setActiveFilter(e.target.value as 'active' | 'inactive' | 'all')
            setPage(1)
          }}
          wrapperClassName="w-36 flex-none"
        >
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="all">Todos</option>
        </NativeSelect>

        <NativeSelect
          value={typeFilter}
          onChange={e => {
            setTypeFilter(e.target.value as 'all' | 'superadmin' | 'admin' | 'emissor')
            setPage(1)
          }}
          wrapperClassName="w-40 flex-none"
        >
          <option value="all">Todos os perfis</option>
          <option value="superadmin">Superadmin</option>
          <option value="admin">Admin</option>
          <option value="emissor">Emissor</option>
        </NativeSelect>

        {isSuperAdmin && (
          <NativeSelect
            value={companyFilter}
            onChange={e => {
              setCompanyFilter(e.target.value)
              setPage(1)
            }}
            wrapperClassName="w-48 flex-none"
          >
            <option value="">Todas as empresas</option>
            {(companiesData?.results ?? []).map(c => (
              <option key={c.id} value={String(c.id)}>
                {c.trade_name || c.name}
              </option>
            ))}
          </NativeSelect>
        )}

        {(searchTerm ||
          activeFilter !== 'active' ||
          typeFilter !== 'all' ||
          companyFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              handleSearchChange('')
              setActiveFilter('active')
              setTypeFilter('all')
              setCompanyFilter('')
            }}
            className="h-10 px-3 text-muted-foreground"
          >
            <FilterX className="size-4 mr-2" />
            Limpar Filtros
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div className="text-xs text-muted-foreground px-1 font-medium uppercase tracking-wider">
          {totalCount} usuário{totalCount !== 1 ? 's' : ''}
        </div>

        <div className="rounded-xl border bg-card shadow-sm overflow-hidden relative">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                {(
                  [
                    ['first_name', 'Usuário'],
                    ['email', 'E-mail'],
                    isSuperAdmin ? [null, 'Empresa'] : null,
                    ['profile', 'Perfil'],
                    ['is_active', 'Status'],
                    ['last_login', 'Último acesso'],
                  ].filter(Boolean) as [string | null, string][]
                ).map(([field, label]) => (
                  <TableHead
                    key={label}
                    className={`font-bold py-4${field === 'is_active' || field === 'last_login' ? ' text-right' : ''}`}
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
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isSuperAdmin ? 7 : 6}
                    className="text-center text-muted-foreground py-16"
                  >
                    <Search className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p>Nenhum usuário encontrado.</p>
                  </TableCell>
                </TableRow>
              ) : (
                users.map(u => (
                  <UserTableRow
                    key={u.id}
                    user={u}
                    isSuperAdmin={isSuperAdmin}
                    onEdit={u => router.push(`/users/${u.id}/edit`)}
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
