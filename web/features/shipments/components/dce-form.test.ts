import { describe, expect, it } from 'vitest'
import type { Person } from '@/features/persons/api'
import { mapEmitterToSenderParte } from './dce-form'

function buildPerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    company: 'company-1',
    name: 'Emitente Teste',
    document: '12345678000195',
    person_type: 'juridica',
    person_type_display: 'Pessoa Jurídica',
    is_carrier: false,
    is_emitente: true,
    tp_emit: 2,
    preferred_series: 1,
    has_certificate: false,
    addresses: [],
    contact_phone: '',
    zip_code: '',
    address: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('mapEmitterToSenderParte', () => {
  it('prioritizes person legacy fields over address fallback', () => {
    const person = buildPerson({
      zip_code: '80000000',
      address: 'Rua Pessoa',
      number: '10',
      complement: 'Sala 1',
      neighborhood: 'Centro',
      contact_phone: '41999999999',
      city: { id: 'city-1', name: 'Curitiba', uf: 'PR', ibge_code: '4106902' },
      addresses: [
        {
          id: 'addr-1',
          label: 'Principal',
          contact_phone: '41888888888',
          contact_email: '',
          zip_code: '11111111',
          address: 'Rua Endereco',
          number: '99',
          complement: '',
          neighborhood: 'Bairro',
          city: { id: 'city-2', name: 'Londrina', uf: 'PR', ibge_code: '4113700' },
          is_default: true,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
      ],
    })

    const result = mapEmitterToSenderParte(person)
    expect(result.person_id).toBe('person-1')
    expect(result.person_address_id).toBe('addr-1')
    expect(result.document).toBe('12.345.678/0001-95')
    expect(result.address).toBe('Rua Pessoa')
    expect(result.number).toBe('10')
    expect(result.neighborhood).toBe('Centro')
    expect(result.contact_phone).toBe('41999999999')
    expect(result.uf).toBe('PR')
    expect(result.city_id).toBe('city-1')
  })

  it('falls back to default active address when person fields are empty', () => {
    const person = buildPerson({
      city: null,
      addresses: [
        {
          id: 'addr-2',
          label: 'Principal',
          contact_phone: '41777777777',
          contact_email: '',
          zip_code: '22222222',
          address: 'Rua Fallback',
          number: '22',
          complement: 'Bloco B',
          neighborhood: 'Centro',
          city: { id: 'city-2', name: 'Londrina', uf: 'PR', ibge_code: '4113700' },
          is_default: true,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
      ],
    })

    const result = mapEmitterToSenderParte(person)
    expect(result.person_address_id).toBe('addr-2')
    expect(result.zip_code).toBe('22222222')
    expect(result.address).toBe('Rua Fallback')
    expect(result.number).toBe('22')
    expect(result.complement).toBe('Bloco B')
    expect(result.neighborhood).toBe('Centro')
    expect(result.contact_phone).toBe('41777777777')
    expect(result.uf).toBe('PR')
    expect(result.city_id).toBe('city-2')
  })
})
