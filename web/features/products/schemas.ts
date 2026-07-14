import * as z from 'zod'
import { normalizeNcm } from '@/lib/document'

export const productSchema = z.object({
  descricao: z.string().min(3, 'Descrição deve ter no mínimo 3 caracteres'),
  ncm: z
    .string()
    .transform(normalizeNcm)
    .refine(v => v.length === 8, 'NCM deve ter exatamente 8 dígitos')
    .refine(v => /^\d{8}$/.test(v), 'NCM deve conter apenas dígitos'),
  unit_value: z
    .union([
      z.literal(''),
      z.coerce
        .number({ invalid_type_error: 'Valor inválido' })
        .positive('Deve ser maior que zero'),
    ])
    .optional(),
})

export type ProductFormInput = z.input<typeof productSchema>
export type ProductFormData = z.output<typeof productSchema>
