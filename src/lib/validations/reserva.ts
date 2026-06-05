import { z } from 'zod'

export const criarReservaSchema = z.object({
  titulo: z
    .string()
    .min(5, 'Título deve ter no mínimo 5 caracteres')
    .max(120, 'Título muito longo'),
  descricao: z.string().max(1000).optional(),
  professorId: z.string().cuid('Professor inválido'),
  turmaId: z.string().cuid('Turma inválida'),
  datas: z
    .array(
      z.object({
        dataInicio: z.string().datetime('Data de início inválida'),
        dataFim: z.string().datetime('Data de fim inválida'),
        recorrente: z.boolean().default(false),
      })
    )
    .min(1, 'Informe ao menos uma data'),
})

export const confirmarReservaSchema = z.object({
  laboratorioId: z.string().cuid('Laboratório inválido'),
})

export const rejeitarReservaSchema = z.object({
  motivoRejeicao: z
    .string()
    .min(10, 'Informe o motivo com ao menos 10 caracteres')
    .max(500),
})

export const criarUsuarioSchema = z.object({
  nome: z.string().min(3).max(100),
  email: z.string().email('Email inválido'),
  senha: z
    .string()
    .min(8, 'Senha deve ter ao menos 8 caracteres')
    .regex(/[A-Z]/, 'Inclua ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Inclua ao menos um número'),
  perfil: z.enum(['APOIO_ACADEMICO', 'OPERADOR_TI', 'ADMINISTRADOR']),
})

export const criarLaboratorioSchema = z.object({
  nome: z.string().min(3).max(100),
  codigo: z.string().min(2).max(20),
  capacidade: z.number().int().min(1).max(500),
  recursos: z.array(z.string()).default([]),
  localizacao: z.string().max(200).optional(),
})

export type CriarReservaInput = z.infer<typeof criarReservaSchema>
export type ConfirmarReservaInput = z.infer<typeof confirmarReservaSchema>
export type RejeitarReservaInput = z.infer<typeof rejeitarReservaSchema>
export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>
export type CriarLaboratorioInput = z.infer<typeof criarLaboratorioSchema>
