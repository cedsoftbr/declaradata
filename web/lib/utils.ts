import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normaliza as chaves de uma linha do Excel para lowercase, permitindo que os
 * schemas Zod trabalhem de forma case-insensitive com os cabeçalhos da planilha.
 */
export function normalizeExcelRow(row: unknown): Record<string, unknown> {
  if (typeof row !== 'object' || row === null) return {}
  return Object.fromEntries(
    Object.entries(row as Record<string, unknown>).map(([k, v]) => [k.toLowerCase(), v])
  )
}

export function parseApiError(err: unknown): string {
  if (typeof err === 'string') return err
  if (Array.isArray(err)) return err.flat().join(', ')
  if (typeof err === 'object' && err !== null) {
    return Object.values(err as Record<string, unknown>)
      .flat()
      .join(', ')
  }
  return 'Erro desconhecido'
}

/**
 * Remove todos os caracteres não numéricos de uma string de telefone.
 */
export function cleanPhone(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/\D/g, '')
}

/**
 * Formata uma string de números para o padrão (99) 99999-9999 ou (99) 9999-9999.
 */
export function formatPhone(value: string | null | undefined): string {
  const digits = cleanPhone(value)
  if (!digits) return ''

  if (digits.length <= 10) {
    // Fixo: (99) 9999-9999
    return digits
      .replace(/^(\d{2})(\d)/g, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 14)
  }
  // Celular: (99) 99999-9999
  return digits
    .replace(/^(\d{2})(\d)/g, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 15)
}

/**
 * Remove todos os caracteres não numéricos de uma string de CEP.
 */
export function cleanCep(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/\D/g, '').slice(0, 8)
}

/**
 * Handler de teclado para inputs de CEP — bloqueia qualquer tecla que não seja
 * dígito, permitindo apenas teclas de controle (Backspace, setas, Tab, etc.)
 * e atalhos de teclado (Ctrl/Cmd + qualquer tecla).
 */
export function cepKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  const ctrl = e.ctrlKey || e.metaKey
  const nav = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End']
  if (!ctrl && !nav.includes(e.key) && !/^\d$/.test(e.key)) {
    e.preventDefault()
  }
}

/**
 * Formata uma string de números para o padrão 00000-000.
 */
export function formatCep(value: string | null | undefined): string {
  const digits = cleanCep(value)
  if (!digits) return ''
  return digits.replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9)
}
