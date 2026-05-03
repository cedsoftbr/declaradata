'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'
import { type Product, productsApi } from '../../products/api'

interface ProductAutocompleteProps {
  value: string
  onChange: (val: string) => void
  onSelect: (product: Product) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function ProductAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  disabled = false,
}: ProductAutocompleteProps) {
  const { accessToken: token } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
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
      setProducts([])
      if (searchValue !== '  ') return
    }

    setIsLoading(true)
    productsApi
      .list(authToken, {
        search: isListAll ? '' : searchValue,
        page_size: isListAll ? 100 : 10,
      })
      .then(res => {
        const list = res.results || []
        setProducts(list)
      })
      .catch(() => setProducts([]))
      .finally(() => setIsLoading(false))
  }, [debouncedSearch, token, isOpen, disabled])

  const handleSelect = (product: Product) => {
    onSelect(product)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Input
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={e => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
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

      {isOpen && products.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-lg shadow-md max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
          <ul className="py-1">
            {products.map(p => (
              <li
                key={p.id}
                onClick={() => handleSelect(p)}
                onKeyDown={e => e.key === 'Enter' && handleSelect(p)}
                className="px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
              >
                <span className="font-medium">{p.descricao}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
