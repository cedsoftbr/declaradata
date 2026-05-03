import { describe, expect, it } from 'vitest'
import { shipmentItemSchema, shipmentSchema } from './schemas'

const validItem = {
  x_prod: 'Produto Teste',
  ncm: '12345678',
  q_com: 10,
  v_un_com: 25.5,
}

const validShipment = {
  recipient_id: '123e4567-e89b-12d3-a456-426614174000',
  tp_emit: 1,
  tp_amb: 2,
  transport_mode: 1,
  items: [validItem],
}

describe('shipmentItemSchema', () => {
  it('valida item correto', () => {
    expect(shipmentItemSchema.safeParse(validItem).success).toBe(true)
  })

  it('rejeita descrição vazia', () => {
    expect(shipmentItemSchema.safeParse({ ...validItem, x_prod: '' }).success).toBe(
      false
    )
  })

  it('rejeita descrição acima de 120 caracteres', () => {
    expect(
      shipmentItemSchema.safeParse({ ...validItem, x_prod: 'a'.repeat(121) }).success
    ).toBe(false)
  })

  it('rejeita NCM com menos de 8 dígitos', () => {
    expect(shipmentItemSchema.safeParse({ ...validItem, ncm: '1234567' }).success).toBe(
      false
    )
  })

  it('rejeita NCM com letras', () => {
    expect(
      shipmentItemSchema.safeParse({ ...validItem, ncm: '1234567a' }).success
    ).toBe(false)
  })

  it('aceita NCM formatado (XXXX.XX.XX)', () => {
    const result = shipmentItemSchema.safeParse({ ...validItem, ncm: '1234.56.78' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.ncm).toBe('12345678')
  })

  it('rejeita quantidade zero', () => {
    expect(shipmentItemSchema.safeParse({ ...validItem, q_com: 0 }).success).toBe(false)
  })

  it('rejeita quantidade negativa', () => {
    expect(shipmentItemSchema.safeParse({ ...validItem, q_com: -1 }).success).toBe(
      false
    )
  })

  it('rejeita valor unitário zero', () => {
    expect(shipmentItemSchema.safeParse({ ...validItem, v_un_com: 0 }).success).toBe(
      false
    )
  })

  it('aceita product_id nulo (produto não vinculado)', () => {
    expect(
      shipmentItemSchema.safeParse({ ...validItem, product_id: null }).success
    ).toBe(true)
  })
})

describe('shipmentSchema', () => {
  it('valida remessa mínima', () => {
    expect(shipmentSchema.safeParse(validShipment).success).toBe(true)
  })

  it('rejeita sem destinatário', () => {
    const { recipient_id: _, ...sem } = validShipment
    expect(shipmentSchema.safeParse(sem).success).toBe(false)
  })

  it('rejeita destinatário com UUID inválido', () => {
    expect(
      shipmentSchema.safeParse({ ...validShipment, recipient_id: 'nao-uuid' }).success
    ).toBe(false)
  })

  it('rejeita sem itens', () => {
    expect(shipmentSchema.safeParse({ ...validShipment, items: [] }).success).toBe(
      false
    )
  })

  it('aceita múltiplos itens', () => {
    const result = shipmentSchema.safeParse({
      ...validShipment,
      items: [validItem, { ...validItem, ncm: '87654321' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejeita tp_amb inválido', () => {
    expect(shipmentSchema.safeParse({ ...validShipment, tp_amb: 9 }).success).toBe(
      false
    )
  })

  it('rejeita transport_mode fora do intervalo', () => {
    expect(
      shipmentSchema.safeParse({ ...validShipment, transport_mode: 6 }).success
    ).toBe(false)
  })

  it('aceita sender e carrier opcionais', () => {
    const result = shipmentSchema.safeParse({
      ...validShipment,
      sender_id: null,
      carrier_id: null,
    })
    expect(result.success).toBe(true)
  })
})
