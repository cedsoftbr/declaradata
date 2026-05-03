import { describe, expect, it } from 'vitest'
import { companySchema } from './schemas'

const base = {
  name: 'Empresa Teste LTDA',
  cnpj: '12.345.678/0001-95',
  is_active: true,
  allow_simulated_environment_for_emitters: true,
}

describe('features/companies/schemas', () => {
  it('valida empresa mínima (só campos obrigatórios)', () => {
    const result = companySchema.safeParse(base)
    expect(result.success).toBe(true)
  })

  it('rejeita razão social muito curta', () => {
    const result = companySchema.safeParse({ ...base, name: 'A' })
    expect(result.success).toBe(false)
  })

  it('rejeita CNPJ com menos de 14 caracteres', () => {
    const result = companySchema.safeParse({ ...base, cnpj: '1122333' })
    expect(result.success).toBe(false)
  })

  it('aceita CNPJ alfanumérico válido', () => {
    const result = companySchema.safeParse({ ...base, cnpj: '0BTHGMMMYK1182' })
    expect(result.success).toBe(true)
  })

  it('rejeita e-mail de contato inválido', () => {
    const result = companySchema.safeParse({ ...base, contact_email: 'nao-e-email' })
    expect(result.success).toBe(false)
  })

  it('aceita e-mail de contato vazio (campo opcional)', () => {
    const result = companySchema.safeParse({ ...base, contact_email: '' })
    expect(result.success).toBe(true)
  })

  it('aceita e-mail de contato válido', () => {
    const result = companySchema.safeParse({
      ...base,
      contact_email: 'contato@empresa.com',
    })
    expect(result.success).toBe(true)
  })

  it('aceita city_id como UUID válido', () => {
    const result = companySchema.safeParse({
      ...base,
      city_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita city_id com formato inválido', () => {
    const result = companySchema.safeParse({ ...base, city_id: 'nao-e-uuid' })
    expect(result.success).toBe(false)
  })
})
