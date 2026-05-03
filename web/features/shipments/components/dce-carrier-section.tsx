'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebounce } from '@/hooks/use-debounce'
import { type Person, personsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { inp, lbl } from './dce-types'

export const TP_TRANSP_CORREIOS = 0
export const TP_TRANSP_PROPRIO = 1
export const TP_TRANSP_TERCEIRIZADO = 2

const FIXED_OPTIONS = [
  { id: '__correios__', name: 'Correios', tpTransp: TP_TRANSP_CORREIOS },
  { id: '__proprio__', name: 'Próprio', tpTransp: TP_TRANSP_PROPRIO },
] as const

interface CarrierSectionProps {
  tpTransp: number
  onTpTranspChange: (v: number) => void
  carrierName: string
  carrierId?: string
  submitted?: boolean
  onCarrierNameChange: (name: string) => void
  onCarrierSelect: (person: Person) => void
  disabled?: boolean
  lockReason?: string
}

export function CarrierSection({
  tpTransp,
  onTpTranspChange,
  carrierName,
  carrierId,
  submitted,
  onCarrierNameChange,
  onCarrierSelect,
  disabled = false,
  lockReason,
}: CarrierSectionProps) {
  const { accessToken: token } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [persons, setPersons] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debouncedSearch = useDebounce(carrierName, 300)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        if (tpTransp === TP_TRANSP_TERCEIRIZADO && !carrierId) {
          onCarrierNameChange('')
        }
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [tpTransp, carrierId, onCarrierNameChange])

  useEffect(() => {
    if (disabled || !token || !isOpen) {
      setPersons([])
      return
    }
    const search = debouncedSearch ?? ''
    const isListAll = search === '  '
    const isNormalSearch = search.length >= 2 && !isListAll
    if (!isListAll && !isNormalSearch) {
      setPersons([])
      return
    }
    setIsLoading(true)
    personsApi
      .list(token, {
        search: isListAll ? '' : search,
        is_active: true,
        is_carrier: true,
        page_size: isListAll ? 100 : 10,
      })
      .then(res => setPersons(res.results ?? []))
      .catch(() => setPersons([]))
      .finally(() => setIsLoading(false))
  }, [debouncedSearch, token, isOpen, disabled])

  const search = carrierName ?? ''
  const isListAll = search === '  '
  const fixedVisible = FIXED_OPTIONS.filter(
    o => isListAll || o.name.toLowerCase().includes(search.toLowerCase())
  )
  const showDropdown =
    isOpen && (fixedVisible.length > 0 || persons.length > 0 || isLoading)
  const hasError = submitted && tpTransp === TP_TRANSP_TERCEIRIZADO && !carrierId

  const handleFixedSelect = (opt: (typeof FIXED_OPTIONS)[number]) => {
    onTpTranspChange(opt.tpTransp)
    onCarrierNameChange(opt.name)
    setIsOpen(false)
  }

  const handlePersonSelect = (person: Person) => {
    onTpTranspChange(TP_TRANSP_TERCEIRIZADO)
    onCarrierSelect(person)
    setIsOpen(false)
  }

  return (
    <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Transportador
      </p>
      <div ref={containerRef} className="relative space-y-1">
        <Label className={lbl}>Transportador *</Label>
        <div className="relative">
          <Input
            value={carrierName}
            onChange={e => {
              const val = e.target.value
              onCarrierNameChange(val)
              if (tpTransp !== TP_TRANSP_TERCEIRIZADO) {
                onTpTranspChange(TP_TRANSP_TERCEIRIZADO)
              }
              setIsOpen(true)
            }}
            onFocus={() => {
              if (disabled) return
              if (search.length >= 2 || isListAll) setIsOpen(true)
            }}
            aria-invalid={hasError}
            className={cn(inp, isLoading && 'pr-8')}
            disabled={disabled}
          />
          {isLoading && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {showDropdown && (
          <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-lg shadow-md max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
            <ul className="py-1">
              {fixedVisible.map(opt => (
                <li
                  key={opt.id}
                  onClick={() => handleFixedSelect(opt)}
                  onKeyDown={e => e.key === 'Enter' && handleFixedSelect(opt)}
                  className="px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                >
                  <span className="font-medium">{opt.name}</span>
                </li>
              ))}
              {persons.map(p => (
                <li
                  key={p.id}
                  onClick={() => handlePersonSelect(p)}
                  onKeyDown={e => e.key === 'Enter' && handlePersonSelect(p)}
                  className="px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                >
                  <span className="font-medium">{p.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasError && (
          <p className="text-[10px] text-destructive font-medium ml-1">
            Transportador obrigatório
          </p>
        )}
        {!hasError && disabled && lockReason && (
          <p className="text-[10px] text-muted-foreground font-medium ml-1">
            {lockReason}
          </p>
        )}
      </div>
    </div>
  )
}
