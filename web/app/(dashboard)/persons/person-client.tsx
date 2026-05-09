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
  Users,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { PersonImportModal } from '@/features/persons/components/person-import-modal'
import { useApi } from '@/hooks/use-api'
import type { Person } from '@/lib/api'

const STATUS_BADGE: Record<string, string> = {
  true: 'border-green-500/30 text-green-600 bg-green-500/5',
  false: 'border-muted-foreground/20 text-muted-foreground bg-muted/20',
}

function formatDocument(doc: string) {
  const digits = doc.replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return doc
}

function hydrateLegacyAddress(person: Person): Person {
  const defaultAddress =
    person.addresses?.find(a => a.is_active && a.is_default) ||
    person.addresses?.find(a => a.is_active) ||
    null

  if (!defaultAddress) return person

  return {
    ...person,
    contact_phone: defaultAddress.contact_phone,
    zip_code: defaultAddress.zip_code,
    address: defaultAddress.address,
    number: defaultAddress.number,
    complement: defaultAddress.complement,
    neighborhood: defaultAddress.neighborhood,
    city: defaultAddress.city,
  }
}

export function PersonsClient() {
  const router = useRouter()
  const { call } = useApi()

  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>(
    'active'
  )
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [ordering, setOrdering] = useState<string>('name')

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
    refetch: refetchPersons,
  } = useQuery({
    queryKey: ['persons', debouncedSearch, activeFilter, page, pageSize, ordering],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (debouncedSearch) qs.set('search', debouncedSearch)
      if (activeFilter === 'active') qs.set('is_active', 'true')
      if (activeFilter === 'inactive') qs.set('is_active', 'false')
      if (ordering) qs.set('ordering', ordering)
      if (page > 1) qs.set('page', String(page))
      qs.set('page_size', String(pageSize))
      const res = await call(`/api/persons?${qs}`)
      if (!res.ok) throw new Error('Erro ao carregar pessoas')
      const data = (await res.json()) as {
        count: number
        next: string | null
        previous: string | null
        results: Person[]
      }
      return {
        ...data,
        results: (data.results || []).map(hydrateLegacyAddress),
      }
    },
  })

  useEffect(() => {
    if (error) toast.error('Erro ao carregar pessoas')
  }, [error])

  const persons = data?.results ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <Users className="size-6 text-muted-foreground" />
          Pessoas
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
            <FileSpreadsheet className="size-4 mr-2" /> Importar
          </Button>
          <Button
            onClick={() => router.push('/persons/new')}
            className="md:w-auto w-full shadow-md bg-foreground text-background hover:bg-foreground/90 font-bold h-11 px-6 rounded-xl"
          >
            <Plus className="size-4 mr-2" /> Nova Pessoa
          </Button>
        </div>
      </div>

      <PersonImportModal
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        onSuccess={() => {
          setPage(1)
          refetchPersons()
        }}
      />

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:max-w-sm group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9 h-10 border shadow-sm rounded-xl"
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

        {(searchTerm || activeFilter !== 'active') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              handleSearchChange('')
              setActiveFilter('active')
            }}
            className="h-10 px-3 text-muted-foreground"
          >
            <FilterX className="size-4 mr-2" /> Limpar
          </Button>
        )}
      </div>

      {isLoading && persons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground font-medium">Carregando...</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground px-1 font-medium uppercase tracking-wider">
            {totalCount} pessoa{totalCount !== 1 ? 's' : ''}
          </div>

          <div className="rounded-xl border bg-card shadow-sm overflow-hidden relative">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  {(
                    [
                      ['document', 'Documento'],
                      ['name', 'Nome / Razão Social'],
                      [null, 'Tipo'],
                      [null, 'Cidade'],
                      ['is_active', 'Status'],
                    ] as [string | null, string][]
                  ).map(([field, label]) => (
                    <TableHead
                      key={label}
                      className={`font-bold py-4${field === 'is_active' ? ' w-[110px] text-right' : ''}`}
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
                {persons.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-16"
                    >
                      <Search className="size-8 opacity-20 mx-auto mb-2" />
                      <p>Nenhuma pessoa encontrada.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  persons.map(p => (
                    <TableRow
                      key={p.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatDocument(p.document)}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{p.name}</TableCell>
                      <TableCell className="text-sm">
                        {p.is_carrier ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase border-foreground/30 text-foreground bg-foreground/5 font-bold tracking-wider"
                          >
                            Transportadora
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase border-muted-foreground/30 text-muted-foreground bg-muted/5 font-bold tracking-wider"
                          >
                            Cliente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.city ? `${p.city.name} - ${p.city.uf}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={STATUS_BADGE[String(p.is_active)]}
                        >
                          {p.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/persons/${p.id}/edit`)}
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
      )}
    </div>
  )
}
