import * as z from 'zod'
import { normalizeNcm } from '@/lib/document'

export const shipmentItemSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  x_prod: z.string().min(1, 'Descrição obrigatória').max(120),
  ncm: z
    .string()
    .transform(normalizeNcm)
    .refine(v => v.length === 8, 'NCM deve ter exatamente 8 dígitos')
    .refine(v => /^\d{8}$/.test(v), 'NCM deve conter apenas dígitos'),
  q_com: z.coerce
    .number({ invalid_type_error: 'Quantidade inválida' })
    .positive('Deve ser maior que zero'),
  v_un_com: z.coerce
    .number({ invalid_type_error: 'Valor inválido' })
    .positive('Deve ser maior que zero'),
})

export type ShipmentItemFormData = z.infer<typeof shipmentItemSchema>

export const shipmentSchema = z.object({
  sender_id: z.string().uuid().nullable().optional(),
  recipient_id: z.string().uuid({ message: 'Destinatário obrigatório' }),
  carrier_id: z.string().uuid().nullable().optional(),
  tp_amb: z.coerce
    .number()
    .int()
    .refine(v => v === 1 || v === 2 || v === 3) as z.ZodType<1 | 2 | 3>,
  transport_mode: z.coerce.number().int().min(1).max(5),
  info_complementar: z.string().optional(),
  items: z.array(shipmentItemSchema).min(1, 'Pelo menos um item é obrigatório'),
})

export type ShipmentFormData = z.infer<typeof shipmentSchema>
