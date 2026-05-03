import { describe, expect, it } from 'vitest'
import { companySchema, personSchema } from './schemas'

describe('Validations (lib/schemas)', () => {
  describe('personSchema', () => {
    it('should accept a valid CPF', () => {
      const data = {
        name: 'João Silva',
        document: '11144477735', // CPF válido
        zip_code: '01001-000',
        address: 'Rua Direita',
        number: '100',
        neighborhood: 'Centro',
        city_id: '123e4567-e89b-12d3-a456-426614174000',
        tipo: 'cliente',
        is_active: true,
      }
      expect(personSchema.safeParse(data).success).toBe(true)
    })

    it('should reject an invalid document', () => {
      const result = personSchema.safeParse({ document: '123' })
      expect(result.success).toBe(false)
    })

    it('should require mandatory fields', () => {
      const result = personSchema.safeParse({ name: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issues = result.error.format()
        expect(issues.name).toBeDefined()
        expect(issues.city_id).toBeDefined()
      }
    })
  })

  describe('companySchema', () => {
    it('should accept valid company data', () => {
      const validCompany = {
        name: 'Empresa de Teste LTDA',
        cnpj: '12.345.678/0001-95',
        is_active: true,
        allow_simulated_environment_for_emitters: true,
      }
      expect(companySchema.safeParse(validCompany).success).toBe(true)
    })

    it('should reject invalid CNPJ', () => {
      expect(
        companySchema.safeParse({
          name: 'A',
          cnpj: '111',
          is_active: true,
          allow_simulated_environment_for_emitters: true,
        }).success
      ).toBe(false)
    })
  })
})
