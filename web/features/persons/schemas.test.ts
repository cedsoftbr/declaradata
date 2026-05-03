import { describe, expect, it } from 'vitest'
import { personSchema } from './schemas'

const base = {
  name: 'Empresa Teste LTDA',
  tipo: 'cliente' as const,
  is_active: true,
  zip_code: '80000000',
  address: 'Rua das Flores',
  number: '123',
  neighborhood: 'Centro',
  city_id: '123e4567-e89b-12d3-a456-426614174000',
}

describe('features/persons/schemas — CPF/CNPJ', () => {
  it('aceita CNPJ válido', () => {
    const result = personSchema.safeParse({ ...base, document: '11222333000181' })
    expect(result.success).toBe(true)
  })

  it('aceita CPF válido', () => {
    const result = personSchema.safeParse({ ...base, document: '52998224725' })
    expect(result.success).toBe(true)
  })

  it('rejeita CNPJ inválido', () => {
    const result = personSchema.safeParse({ ...base, document: '11111111111111' })
    expect(result.success).toBe(false)
  })

  it('rejeita CPF inválido (dígitos repetidos)', () => {
    const result = personSchema.safeParse({ ...base, document: '11111111111' })
    expect(result.success).toBe(false)
  })

  it('rejeita CPF com dígito verificador errado', () => {
    const result = personSchema.safeParse({ ...base, document: '52998224700' })
    expect(result.success).toBe(false)
  })

  it('aceita CNPJ com máscara', () => {
    const result = personSchema.safeParse({ ...base, document: '11.222.333/0001-81' })
    expect(result.success).toBe(true)
  })

  it('aceita CNPJ alfanumérico válido', () => {
    const result = personSchema.safeParse({ ...base, document: 'IQBP5MYJWJ9H84' })
    expect(result.success).toBe(true)
  })

  it('aceita CPF com máscara', () => {
    const result = personSchema.safeParse({ ...base, document: '529.982.247-25' })
    expect(result.success).toBe(true)
  })
})

describe('features/persons/schemas — campos obrigatórios', () => {
  it('rejeita nome muito curto', () => {
    const result = personSchema.safeParse({
      ...base,
      document: '52998224725',
      name: 'A',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita CEP vazio', () => {
    const result = personSchema.safeParse({
      ...base,
      document: '52998224725',
      zip_code: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita city_id inválido', () => {
    const result = personSchema.safeParse({
      ...base,
      document: '52998224725',
      city_id: 'nao-e-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('aceita tipo transportador', () => {
    const result = personSchema.safeParse({
      ...base,
      document: '52998224725',
      tipo: 'transportador',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita tipo inválido', () => {
    const result = personSchema.safeParse({
      ...base,
      document: '52998224725',
      tipo: 'invalido',
    })
    expect(result.success).toBe(false)
  })
})
