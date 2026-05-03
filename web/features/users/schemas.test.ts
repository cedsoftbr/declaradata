import { describe, expect, it } from 'vitest'
import { userSchema } from './schemas'

const base = {
  email: 'usuario@empresa.com',
  first_name: 'João',
  last_name: 'Silva',
  is_active: true,
}

describe('features/users/schemas', () => {
  it('valida usuário mínimo', () => {
    expect(userSchema.safeParse(base).success).toBe(true)
  })

  it('rejeita e-mail inválido', () => {
    expect(userSchema.safeParse({ ...base, email: 'nao-e-email' }).success).toBe(false)
  })

  it('rejeita primeiro nome muito curto', () => {
    expect(userSchema.safeParse({ ...base, first_name: 'A' }).success).toBe(false)
  })

  it('rejeita sobrenome muito curto', () => {
    expect(userSchema.safeParse({ ...base, last_name: 'A' }).success).toBe(false)
  })

  it('aceita profiles válidos', () => {
    const profiles = ['superadmin', 'admin', 'emissor'] as const
    for (const profile of profiles) {
      expect(userSchema.safeParse({ ...base, profile }).success).toBe(true)
    }
  })

  it('rejeita profile inválido', () => {
    expect(userSchema.safeParse({ ...base, profile: 'gerente' }).success).toBe(false)
  })

  it('aceita company_id como UUID válido', () => {
    const result = userSchema.safeParse({
      ...base,
      company_id: '123e4567-e89b-12d3-a456-426614174000',
    })
    expect(result.success).toBe(true)
  })

  it('aceita company_id nulo (superadmin sem empresa)', () => {
    expect(userSchema.safeParse({ ...base, company_id: null }).success).toBe(true)
  })

  it('aceita senha opcional', () => {
    expect(userSchema.safeParse({ ...base, password: 'senha123' }).success).toBe(true)
    expect(userSchema.safeParse({ ...base, password: undefined }).success).toBe(true)
  })
})
