import * as z from 'zod'
import { isValidCpfOrCnpj } from '@/lib/document'

export const seriesSchema = z
  .object({
    id: z.string().optional(),
    code: z.number().min(1, 'Série inválida').max(999, 'Série inválida'),
    last_number: z.number().min(0),
    original_last_number: z.number().optional().default(0),
    next_number: z.number().min(1).optional(),
    is_active: z.boolean(),
    ambient: z.number().min(1).max(3),
  })
  .superRefine((data, ctx) => {
    const last = data.original_last_number ?? 0
    const next = data.next_number
    if (next !== undefined && next <= last) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Próximo deve ser maior que ${last}.`,
        path: ['next_number'],
      })
    }
  })

export const personSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome / Razão Social é obrigatório')
    .max(60, 'Máximo 60 caracteres'),
  document: z.string().refine(isValidCpfOrCnpj, 'Documento inválido (CPF ou CNPJ)'),
  tipo: z.enum(['cliente', 'transportador']),
  is_active: z.boolean(),
  is_emitente: z.boolean().default(false),
  tp_emit: z.number().default(2),
  environment: z.number().default(3),
  series: z.array(seriesSchema).default([]),
  zip_code: z.string().min(8, 'CEP obrigatório'),
  address: z.string().min(1, 'Logradouro obrigatório'),
  number: z.string().min(1, 'Número obrigatório'),
  complement: z.string().optional(),
  neighborhood: z.string().min(1, 'Bairro obrigatório'),
  city_id: z.string().uuid('Cidade obrigatória'),
  _city_label: z.string().optional(),
  contact_phone: z.string().optional(),
})

export type PersonFormData = z.input<typeof personSchema>
