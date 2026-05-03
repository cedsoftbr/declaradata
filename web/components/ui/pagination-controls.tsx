'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

const PAGE_SIZE_OPTIONS = [25, 50, 100]

interface PaginationControlsProps {
  page: number
  totalPages: number
  pageSize: number
  totalCount: number
  isFetching: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function PaginationControls({
  page,
  totalPages,
  pageSize,
  totalCount,
  isFetching,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  if (totalCount === 0 || Number.isNaN(totalPages)) return null

  const pageNumbers = getPageWindow(page, totalPages)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
      {/* Anterior + números + Próxima */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1 || isFetching}
          className="h-9 rounded-xl px-3"
        >
          <ChevronLeft className="size-4" />
          <span className="sr-only">Anterior</span>
        </Button>

        {pageNumbers.map((n, i) =>
          n === null ? (
            <span
              key={`ellipsis-${i < pageNumbers.length / 2 ? 'start' : 'end'}`}
              className="h-9 w-9 flex items-center justify-center text-muted-foreground text-sm select-none"
            >
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPageChange(n)}
              disabled={isFetching}
              className={`h-9 w-9 rounded-xl text-sm font-medium transition-colors ${
                n === page
                  ? 'bg-foreground text-background'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              {n}
            </button>
          )
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || isFetching}
          className="h-9 rounded-xl px-3"
        >
          <span className="sr-only">Próxima</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Seletor de registros por página */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="whitespace-nowrap">Por página</span>
        <NativeSelect
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          disabled={isFetching}
          wrapperClassName="w-20"
        >
          {PAGE_SIZE_OPTIONS.map(opt => (
            <NativeSelectOption key={opt} value={opt}>
              {opt}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </div>
  )
}

/** Gera janela deslizante de até 7 botões com reticências nos extremos. */
function getPageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | null)[] = []

  if (current <= 4) {
    // início: 1 2 3 4 5 … total
    pages.push(1, 2, 3, 4, 5, null, total)
  } else if (current >= total - 3) {
    // fim: 1 … t-4 t-3 t-2 t-1 t
    pages.push(1, null, total - 4, total - 3, total - 2, total - 1, total)
  } else {
    // meio: 1 … c-1 c c+1 … total
    pages.push(1, null, current - 1, current, current + 1, null, total)
  }

  return pages
}
