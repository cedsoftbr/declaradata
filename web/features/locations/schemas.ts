import * as z from 'zod'

export const citySchema = z.object({
  name: z.string().min(2, 'Obrigatório'),
  uf: z.string().length(2, 'Selecione a UF'),
  ibge_code: z.string().min(1, 'Obrigatório'),
})

export type CityFormData = z.infer<typeof citySchema>
