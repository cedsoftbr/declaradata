'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/use-debounce'
import { type Person, personsApi } from '@/lib/api'
import { cn } from '@/lib/utils'

interface PersonAutocompleteProps {
  value: string
  onChange: (val: string) => void
  onSelect: (person: Person) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  id?: string
  disabled?: boolean
  'aria-invalid'?: boolean
  filters?: {
    is_carrier?: boolean
    is_active?: boolean
  }
}

export function PersonAutocomplete({
  value,
  onChange,
  onSelect,
  onBlur,
  placeholder,
  className,
  id,
  disabled = false,
  'aria-invalid': ariaInvalid,
  filters,
}: PersonAutocompleteProps) {
  const { accessToken: token } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [results, setResults] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debouncedSearch = useDebounce(value, 300)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const authToken = token ?? ''
    const searchValue = debouncedSearch ?? ''
    const isListAll = searchValue === '  '
    const isNormalSearch = searchValue.length >= 2 && !isListAll

    if (disabled || !authToken || !isOpen || (!isListAll && !isNormalSearch)) {
      setResults([])
      if (searchValue !== '  ') return
    }

    setIsLoading(true)
    personsApi
      .list(authToken, {
        search: isListAll ? '' : searchValue,
        is_active: filters?.is_active ?? true,
        is_carrier: filters?.is_carrier,
        page_size: isListAll ? 100 : 10,
      })
      .then(res => {
        setResults(res.results || [])
      })
      .catch(() => setResults([]))
      .finally(() => setIsLoading(false))
  }, [
    debouncedSearch,
    token,
    isOpen,
    filters?.is_carrier,
    filters?.is_active,
    disabled,
  ])

  const handleSelect = (person: Person) => {
    onSelect(person)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Input
          id={id}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          value={value}
          maxLength={60}
          onChange={e => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onBlur={onBlur}
          onFocus={() => {
            if (disabled) return
            if (value.length >= 2) setIsOpen(true)
          }}
          className={cn(className, isLoading && 'pr-8')}
        />
        {isLoading && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-lg shadow-md max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
          <ul className="py-1">
            {results.map(p => (
              <li
                key={p.id}
                onClick={() => handleSelect(p)}
                onKeyDown={e => e.key === 'Enter' && handleSelect(p)}
                className="px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
              >
                <span className="font-medium">{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
