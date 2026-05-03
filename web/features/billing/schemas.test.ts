import { describe, expect, it } from 'vitest'
import { planSchema } from './schemas'

const base = {
  name: 'Pro',
  monthly_dce_limit: 500,
  active_user_limit: 10,
  price: '599.00',
  is_active: true,
}

describe('features/billing/schemas', () => {
  it('valida plano mínimo válido', () => {
    expect(planSchema.safeParse(base).success).toBe(true)
  })

  it('rejeita nome vazio', () => {
    expect(planSchema.safeParse({ ...base, name: '' }).success).toBe(false)
  })

  it('rejeita limite de DC-e menor que 1', () => {
    expect(planSchema.safeParse({ ...base, monthly_dce_limit: 0 }).success).toBe(false)
  })

  it('rejeita limite de usuários menor que 1', () => {
    expect(planSchema.safeParse({ ...base, active_user_limit: 0 }).success).toBe(false)
  })

  it('rejeita preço com formato inválido', () => {
    expect(planSchema.safeParse({ ...base, price: 'abc' }).success).toBe(false)
  })

  it('aceita preço sem centavos', () => {
    expect(planSchema.safeParse({ ...base, price: '299' }).success).toBe(true)
  })

  it('aceita preço zero', () => {
    expect(planSchema.safeParse({ ...base, price: '0' }).success).toBe(true)
  })
})
