import * as z from 'zod'
import { validateCNPJ } from '@/lib/document'

export const companySchema = z.object({
  name: z.string().min(2, 'Razão social é obrigatória'),
  trade_name: z.string().optional(),
  cnpj: z.string().refine(validateCNPJ, 'CNPJ inválido'),
  zip_code: z.string().optional(),
  address: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z
    .union([z.literal(''), z.string().email('E-mail inválido')])
    .optional(),
  plan_id: z.string().uuid().nullable().optional(),
  allow_simulated_environment_for_emitters: z.boolean(),
})

export type CompanyFormData = z.infer<typeof companySchema>
