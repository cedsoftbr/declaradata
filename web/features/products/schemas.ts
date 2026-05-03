import * as z from 'zod'
import { normalizeNcm } from '@/lib/document'

export const productSchema = z.object({
  descricao: z.string().min(3, 'Descrição deve ter no mínimo 3 caracteres'),
  ncm: z
    .string()
    .transform(normalizeNcm)
    .refine(v => v.length === 8, 'NCM deve ter exatamente 8 dígitos')
    .refine(v => /^\d{8}$/.test(v), 'NCM deve conter apenas dígitos'),
})

export type ProductFormData = z.infer<typeof productSchema>
