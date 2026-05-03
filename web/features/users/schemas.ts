import * as z from 'zod'

export const userSchema = z.object({
  email: z.string().email('E-mail inválido'),
  first_name: z.string().min(2, 'Mínimo 2 caracteres'),
  last_name: z.string().min(2, 'Mínimo 2 caracteres'),
  profile: z.enum(['superadmin', 'admin', 'emissor', 'viewer']).optional(),
  company_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean(),
  password: z.string().optional(),
  allowed_emitente_ids: z.array(z.string().uuid()).optional(),
})

export type UserFormValues = z.infer<typeof userSchema>
