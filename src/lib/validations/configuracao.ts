import { z } from 'zod'

export const criarFilaChamadoSchema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres').max(100),
  flexfield: z.string().min(1, 'O flexfield é obrigatório').max(20),
  disparaTeams: z.boolean().default(false),
  ativo: z.boolean().default(true)
})

export const editarFilaChamadoSchema = criarFilaChamadoSchema.partial()

export type CriarFilaChamadoInput = z.infer<typeof criarFilaChamadoSchema>
export type EditarFilaChamadoInput = z.infer<typeof editarFilaChamadoSchema>
