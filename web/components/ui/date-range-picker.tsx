'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar as CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DateRangePickerProps {
  className?: string
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
}

export function DateRangePicker({
  className,
  value,
  onChange,
  placeholder,
}: DateRangePickerProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              id="date"
              variant={'outline'}
              className={cn(
                'h-10 justify-start text-left font-normal rounded-xl border shadow-sm',
                !value && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {value?.from ? (
                value.to ? (
                  <>
                    {format(value.from, 'dd/MM/yyyy', { locale: ptBR })} -{' '}
                    {format(value.to, 'dd/MM/yyyy', { locale: ptBR })}
                  </>
                ) : (
                  format(value.from, 'dd/MM/yyyy', { locale: ptBR })
                )
              ) : (
                <span>{placeholder || 'Selecione um período'}</span>
              )}
            </Button>
          }
        />
        <PopoverContent className="w-auto p-0 rounded-xl" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={value?.from}
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
