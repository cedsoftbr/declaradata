import { describe, expect, it, vi } from 'vitest'
import {
  cepKeyDown,
  cleanCep,
  cleanPhone,
  cn,
  formatCep,
  formatPhone,
  normalizeExcelRow,
  parseApiError,
} from './utils'

describe('lib/utils', () => {
  describe('cn', () => {
    it('should merge tailwind classes correctly', () => {
      expect(cn('px-2 py-2', 'p-4')).toBe('p-4')
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    })

    it('should handle conditional classes', () => {
      expect(cn('base', true && 'is-true', false && 'is-false')).toContain(
        'base is-true'
      )
      expect(cn('base', true && 'is-true', false && 'is-false')).not.toContain(
        'is-false'
      )
    })
  })

  describe('normalizeExcelRow', () => {
    it('should normalize keys to lowercase', () => {
      const input = { 'Nome Completo': 'João', 'E-MAIL': 'joao@exemplo.com', ID: 123 }
      const output = normalizeExcelRow(input)
      expect(output).toEqual({
        'nome completo': 'João',
        'e-mail': 'joao@exemplo.com',
        id: 123,
      })
    })

    it('should return empty object for invalid inputs', () => {
      expect(normalizeExcelRow(null)).toEqual({})
      expect(normalizeExcelRow(undefined)).toEqual({})
      expect(normalizeExcelRow('not an object')).toEqual({})
    })
  })

  describe('parseApiError', () => {
    it('should handle string errors', () => {
      expect(parseApiError('Erro direto')).toBe('Erro direto')
    })

    it('should handle array errors', () => {
      expect(parseApiError(['Erro 1', 'Erro 2'])).toBe('Erro 1, Erro 2')
    })

    it('should handle object errors from Django/Rest Framework', () => {
      const error = {
        email: ['E-mail já cadastrado'],
        password: ['Senha muito curta', 'Deve conter números'],
      }
      expect(parseApiError(error)).toBe(
        'E-mail já cadastrado, Senha muito curta, Deve conter números'
      )
    })

    it('should handle nested array errors', () => {
      const error = [['Erro A'], ['Erro B']]
      expect(parseApiError(error)).toBe('Erro A, Erro B')
    })

    it('should return default message for unknown types', () => {
      expect(parseApiError(123)).toBe('Erro desconhecido')
      expect(parseApiError(null)).toBe('Erro desconhecido')
    })
  })

  describe('phone utilities', () => {
    it('should clean phone strings', () => {
      expect(cleanPhone('(11) 99999-9999')).toBe('11999999999')
      expect(cleanPhone('11-9999-9999')).toBe('1199999999')
      expect(cleanPhone(null)).toBe('')
    })

    it('should format landline phones', () => {
      expect(formatPhone('1144445555')).toBe('(11) 4444-5555')
    })

    it('should format mobile phones', () => {
      expect(formatPhone('11988887777')).toBe('(11) 98888-7777')
    })

    it('should return empty string for null phone', () => {
      expect(formatPhone(null)).toBe('')
    })
  })

  describe('cep utilities', () => {
    it('should clean cep strings', () => {
      expect(cleanCep('01234-567')).toBe('01234567')
      expect(cleanCep(null)).toBe('')
    })

    it('should strip text pasted alongside digits (e.g. "CEP 01234-567")', () => {
      expect(cleanCep('CEP 01234-567')).toBe('01234567')
      expect(cleanCep('cep: 01.234-567')).toBe('01234567')
      expect(cleanCep('   01234567   ')).toBe('01234567')
    })

    it('should limit to 8 digits', () => {
      expect(cleanCep('012345678999')).toBe('01234567')
    })

    it('should format cep strings', () => {
      expect(formatCep('01234567')).toBe('01234-567')
    })

    it('should return empty string for null cep', () => {
      expect(formatCep(null)).toBe('')
    })

    it('should format partial cep without hyphen', () => {
      expect(formatCep('01234')).toBe('01234')
    })
  })

  describe('cepKeyDown', () => {
    function makeKeyEvent(key: string, ctrlKey = false, metaKey = false) {
      const preventDefault = vi.fn()
      return {
        key,
        ctrlKey,
        metaKey,
        preventDefault,
      } as unknown as React.KeyboardEvent<HTMLInputElement>
    }

    it('should allow digit keys 0-9', () => {
      for (const digit of '0123456789') {
        const e = makeKeyEvent(digit)
        cepKeyDown(e)
        expect(e.preventDefault).not.toHaveBeenCalled()
      }
    })

    it('should block letter keys', () => {
      for (const letter of ['a', 'z', 'A', 'Z', 'e', 'C', 'P']) {
        const e = makeKeyEvent(letter)
        cepKeyDown(e)
        expect(e.preventDefault).toHaveBeenCalled()
      }
    })

    it('should block special characters', () => {
      for (const char of [' ', '-', '.', ',', '/', '!', '@']) {
        const e = makeKeyEvent(char)
        cepKeyDown(e)
        expect(e.preventDefault).toHaveBeenCalled()
      }
    })

    it('should allow navigation keys', () => {
      const navKeys = [
        'Backspace',
        'Delete',
        'ArrowLeft',
        'ArrowRight',
        'Tab',
        'Home',
        'End',
      ]
      for (const key of navKeys) {
        const e = makeKeyEvent(key)
        cepKeyDown(e)
        expect(e.preventDefault).not.toHaveBeenCalled()
      }
    })

    it('should allow Ctrl+key combinations (e.g. Ctrl+V, Ctrl+C)', () => {
      for (const key of ['v', 'c', 'x', 'a', 'z']) {
        const e = makeKeyEvent(key, true)
        cepKeyDown(e)
        expect(e.preventDefault).not.toHaveBeenCalled()
      }
    })

    it('should allow Meta+key combinations (e.g. Cmd+V on macOS)', () => {
      const e = makeKeyEvent('v', false, true)
      cepKeyDown(e)
      expect(e.preventDefault).not.toHaveBeenCalled()
    })
  })
})
