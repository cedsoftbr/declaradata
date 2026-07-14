'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ncmCatalogApi } from '@/features/ncm-catalog/api'
import { formatNcm, normalizeNcm } from '@/lib/document'
import { cn } from '@/lib/utils'
import { type ItemState, inp } from './dce-types'
import { ProductAutocomplete } from './product-autocomplete'

const COLUMNS = [
  'Descrição *',
  'Quantidade *',
  'Vlr. Unit. (R$) *',
  'NCM *',
  'Valor Total',
  ' ',
]

interface ItemsListProps {
  items: ItemState[]
  onAdd: () => void
  onRemove: (idx: number) => void
  onUpdate: (idx: number, updates: Partial<ItemState>) => void
  submitted?: boolean
  readOnly?: boolean
}

export function ItemsList({
  items,
  onAdd,
  onRemove,
  onUpdate,
  submitted = false,
  readOnly = false,
}: ItemsListProps) {
  const { accessToken: token } = useAuth()
  const [ncmWarnings, setNcmWarnings] = useState<Record<number, boolean>>({})

  const checkNcm = async (idx: number, value: string) => {
    const digits = normalizeNcm(value)
    if (digits.length !== 8 || !token) {
      setNcmWarnings(prev => {
        const next = { ...prev }
        delete next[idx]
        return next
      })
      return
    }
    try {
      const res = await ncmCatalogApi.check(token, digits)
      setNcmWarnings(prev => ({ ...prev, [idx]: res.count === 0 }))
    } catch {
      setNcmWarnings(prev => {
        const next = { ...prev }
        delete next[idx]
        return next
      })
    }
  }

  const totalValue = items.reduce(
    (sum, it) => sum + (parseFloat(it.q_com) || 0) * (parseFloat(it.v_un_com) || 0),
    0
  )

  return (
    <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Produtos
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={readOnly}
          className="h-8 rounded-xl font-bold px-4 text-xs"
        >
          <Plus className="size-3.5 mr-1.5" /> Novo
        </Button>
      </div>

      <div className="space-y-3">
        <div className="hidden md:grid grid-cols-[2fr_120px_120px_130px_120px_32px] gap-3 px-1">
          {COLUMNS.map(h => (
            <p
              key={h}
              className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              {h}
            </p>
          ))}
        </div>

        {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rendering complex item grid with validation and updates */}
        {items.map((it, idx) => (
          <div
            key={it.id}
            className="grid md:grid-cols-[2fr_120px_120px_130px_120px_32px] gap-3 items-start"
          >
            <div className="space-y-1">
              <ProductAutocomplete
                value={it.x_prod}
                onChange={val => onUpdate(idx, { product_id: null, x_prod: val })}
                onSelect={p =>
                  onUpdate(idx, {
                    product_id: p.id,
                    x_prod: p.descricao,
                    ncm: formatNcm(p.ncm),
                    v_un_com:
                      p.unit_value && !(parseFloat(it.v_un_com) > 0)
                        ? p.unit_value
                        : it.v_un_com,
                  })
                }
                className={inp}
                disabled={readOnly}
                aria-invalid={submitted && !it.x_prod}
              />
              {submitted && !it.x_prod && (
                <p className="text-[10px] text-destructive font-medium ml-1">
                  Obrigatório
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Input
                disabled={readOnly}
                value={it.q_com}
                onChange={e =>
                  onUpdate(idx, {
                    q_com: e.target.value.replace(/\D/g, ''),
                  })
                }
                type="number"
                min="0"
                step="1"
                className={inp}
                aria-invalid={submitted && (!it.q_com || parseFloat(it.q_com) <= 0)}
              />
              {submitted && (!it.q_com || parseFloat(it.q_com) <= 0) && (
                <p className="text-[10px] text-destructive font-medium ml-1">
                  {it.q_com ? '> 0' : 'Obrigatório'}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Input
                disabled={readOnly}
                value={it.v_un_com}
                onChange={e =>
                  onUpdate(idx, { v_un_com: e.target.value.replace(',', '.') })
                }
                type="number"
                min="0"
                step="0.01"
                className={inp}
                aria-invalid={
                  submitted && (!it.v_un_com || parseFloat(it.v_un_com) <= 0)
                }
              />
              {submitted && (!it.v_un_com || parseFloat(it.v_un_com) <= 0) && (
                <p className="text-[10px] text-destructive font-medium ml-1">
                  {it.v_un_com ? '> 0' : 'Obrigatório'}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Input
                disabled={readOnly}
                value={it.ncm}
                onChange={e => {
                  const formatted = formatNcm(e.target.value)
                  onUpdate(idx, { ncm: formatted })
                  const digits = normalizeNcm(formatted)
                  if (digits.length === 8) {
                    checkNcm(idx, formatted)
                  } else {
                    setNcmWarnings(prev => {
                      const next = { ...prev }
                      delete next[idx]
                      return next
                    })
                  }
                }}
                maxLength={10}
                className={cn(
                  inp,
                  ncmWarnings[idx] && !submitted
                    ? 'border-amber-400 ring-3 ring-amber-400/30 focus-visible:ring-amber-400/30'
                    : ''
                )}
                aria-invalid={submitted && it.ncm.replace(/\D/g, '').length !== 8}
              />
              {submitted && it.ncm.replace(/\D/g, '').length !== 8 && (
                <p className="text-[10px] text-destructive font-medium ml-1">
                  {it.ncm ? 'Inválido' : 'Obrigatório'}
                </p>
              )}
              {ncmWarnings[idx] && !submitted && (
                <p className="text-[10px] text-amber-500 font-medium ml-1">
                  NCM não catalogado
                </p>
              )}
            </div>

            <Input
              readOnly
              disabled={readOnly}
              className={inp}
              value={(
                (parseFloat(it.q_com) || 0) * (parseFloat(it.v_un_com) || 0)
              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            />

            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg mt-0.5"
              onClick={() => {
                onRemove(idx)
                setNcmWarnings(prev => {
                  const next = { ...prev }
                  delete next[idx]
                  return next
                })
              }}
              disabled={readOnly || items.length === 1}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-2 border-t border-muted-foreground/10">
        <div className="flex gap-6 text-sm">
          <span className="text-muted-foreground">
            {items.filter(i => i.x_prod).length} produto(s)
          </span>
          <span className="font-semibold">
            Total:{' '}
            {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
      </div>
    </div>
  )
}
