import { describe, expect, it } from 'vitest'
import { productSchema } from './schemas'

describe('features/products/schemas', () => {
  it('should validate a correct product', () => {
    const validProduct = {
      descricao: 'Produto de Teste',
      ncm: '12345678',
    }
    const result = productSchema.safeParse(validProduct)
    expect(result.success).toBe(true)
  })

  it('should fail if descricao is too short', () => {
    const invalidProduct = {
      descricao: 'Ab',
      ncm: '12345678',
    }
    const result = productSchema.safeParse(invalidProduct)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.errors[0].message).toBe(
        'Descrição deve ter no mínimo 3 caracteres'
      )
    }
  })

  it('should fail if ncm is not 8 digits', () => {
    const invalidProduct = {
      descricao: 'Produto de Teste',
      ncm: '1234567',
    }
    const result = productSchema.safeParse(invalidProduct)
    expect(result.success).toBe(false)
  })

  it('should fail if ncm contains non-digits', () => {
    const invalidProduct = {
      descricao: 'Produto de Teste',
      ncm: '1234567a',
    }
    const result = productSchema.safeParse(invalidProduct)
    expect(result.success).toBe(false)
  })
})
