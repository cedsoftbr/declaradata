'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface PinInputProps {
  value: string
  onChange: (value: string) => void
  length?: number
  disabled?: boolean
  className?: string
}

export function PinInput({
  value,
  onChange,
  length = 6,
  disabled,
  className,
}: PinInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  const digits = value.padEnd(length, ' ').slice(0, length).split('')

  function handleChange(index: number, char: string) {
    const cleaned = char.replace(/\D/g, '').slice(-1)
    const next = digits
      .map((d, i) => (i === index ? cleaned : d))
      .join('')
      .replace(/\s/g, '')
    onChange(next)
    if (cleaned && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[index]?.trim()) {
        const next = digits.map((d, i) => (i === index ? '' : d)).join('')
        onChange(next)
      } else if (index > 0) {
        refs.current[index - 1]?.focus()
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(pasted)
    const focusIndex = Math.min(pasted.length, length - 1)
    refs.current[focusIndex]?.focus()
  }

  const slots = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'].slice(0, length)

  return (
    <div className={cn('flex gap-2', className)}>
      {slots.map((id, i) => (
        <input
          key={id}
          ref={el => {
            refs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i]?.trim() ?? ''}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={cn(
            'w-12 h-14 text-center text-2xl font-mono rounded-xl border',
            'border-muted-foreground/20 bg-background',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        />
      ))}
    </div>
  )
}
