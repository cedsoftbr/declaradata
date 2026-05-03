import { describe, expect, it } from 'vitest'
import {
  formatCpfOrCnpj,
  formatNcm,
  isValidCpfOrCnpj,
  normalizeDocument,
  normalizeNcm,
} from './document'

describe('lib/document', () => {
  describe('normalizeDocument', () => {
    it('should remove special characters and uppercase', () => {
      expect(normalizeDocument('123.abc-456')).toBe('123ABC456')
    })
  })

  describe('formatCpfOrCnpj', () => {
    it('should format CPF correctly', () => {
      expect(formatCpfOrCnpj('12345678901')).toBe('123.456.789-01')
      expect(formatCpfOrCnpj('123')).toBe('123')
      expect(formatCpfOrCnpj('123456')).toBe('123.456')
    })

    it('should format CNPJ correctly', () => {
      expect(formatCpfOrCnpj('12345678000199')).toBe('12.345.678/0001-99')
      expect(formatCpfOrCnpj('12345678')).toBe('123.456.78')
    })
  })

  describe('normalizeNcm', () => {
    it('should keep only 8 digits', () => {
      expect(normalizeNcm('12.34.56.78-99')).toBe('12345678')
    })
  })

  describe('formatNcm', () => {
    it('should format NCM correctly', () => {
      expect(formatNcm('12345678')).toBe('1234.56.78')
      expect(formatNcm('1234')).toBe('1234')
      expect(formatNcm('123456')).toBe('1234.56')
    })
  })

  describe('isValidCpfOrCnpj', () => {
    it('should validate valid CPF', () => {
      // Common valid CPF for testing
      expect(isValidCpfOrCnpj('123.456.789-09')).toBe(true)
    })

    it('should invalidate invalid CPF', () => {
      expect(isValidCpfOrCnpj('111.111.111-11')).toBe(false)
      expect(isValidCpfOrCnpj('123.456.789-00')).toBe(false)
    })

    it('should validate valid CNPJ', () => {
      // Common valid CNPJ for testing
      expect(isValidCpfOrCnpj('12.345.678/0001-95')).toBe(true)
    })

    it('should invalidate invalid CNPJ', () => {
      expect(isValidCpfOrCnpj('12.345.678/0001-00')).toBe(false)
    })

    it('should return false for invalid lengths', () => {
      expect(isValidCpfOrCnpj('123')).toBe(false)
      expect(isValidCpfOrCnpj('123456789012345')).toBe(false)
    })
  })
})
