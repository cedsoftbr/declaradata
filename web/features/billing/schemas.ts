import { z } from 'zod'

export const planSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  monthly_dce_limit: z.coerce.number().int().min(1, 'Mínimo 1'),
  active_user_limit: z.coerce.number().int().min(1, 'Mínimo 1'),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Preço inválido'),
  is_active: z.boolean(),
})

export type PlanFormData = z.infer<typeof planSchema>
