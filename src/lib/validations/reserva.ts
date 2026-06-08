import { z } from 'zod'

// ─── Reservas ─────────────────────────────────────────────────────────────────

const dataHorarioInputSchema = z.object({
  dataInicio: z.string().min(1, 'Informe a data de início'),
  dataFim: z.string().min(1, 'Informe a data de fim'),
  recorrente: z.boolean().default(false),
}).refine((d) => new Date(d.dataFim) > new Date(d.dataInicio), {
  message: 'Data de fim deve ser posterior ao início',
  path: ['dataFim'],
})

export const criarReservaFormSchema = z.object({
  titulo: z
    .string()
    .min(5, 'Título deve ter no mínimo 5 caracteres')
    .max(120, 'Título muito longo'),
  descricao: z.string().max(1000).optional(),
  professorId: z.string().cuid('Professor inválido'),
  turmaId: z.string().cuid('Turma inválida'),
  datas: z.array(dataHorarioInputSchema).min(1, 'Informe ao menos uma data'),
})

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

const dataHorarioSchema = z.object({
  dataInicio: z.string().datetime('Data de início inválida'),
  dataFim: z.string().datetime('Data de fim inválida'),
  recorrente: z.boolean().default(false),
})

export const reagendarReservaSchema = z.object({
  reservaId: z.string().cuid('Reserva inválida'),
  datas: z.array(dataHorarioSchema).min(1, 'Informe ao menos uma data'),
})

export const confirmarReservaActionSchema = confirmarReservaSchema.extend({
  reservaId: z.string().cuid('Reserva inválida'),
})

export const rejeitarReservaActionSchema = rejeitarReservaSchema.extend({
  reservaId: z.string().cuid('Reserva inválida'),
})

export const conflitoReservaSchema = z.object({
  reservaId: z.string().cuid('Reserva inválida'),
})

export const uploadAnexoSchema = z.object({
  nomeArquivo: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  tamanho: z.number().int().positive().max(10 * 1024 * 1024, 'Arquivo máximo 10 MB'),
})

// ─── Laboratórios ─────────────────────────────────────────────────────────────

export const criarLaboratorioSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
  codigo: z.string().min(2, 'Código deve ter ao menos 2 caracteres').max(20),
  capacidade: z
    .number({ error: 'Informe a capacidade' })
    .int()
    .min(1, 'Capacidade mínima é 1')
    .max(500, 'Capacidade máxima é 500'),
  recursos: z.array(z.string()).default([]),
  localizacao: z.string().max(200).optional(),
})

export const editarLaboratorioSchema = criarLaboratorioSchema.partial()

// ─── Professores ──────────────────────────────────────────────────────────────

export const criarProfessorSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
  email: z.string().email('Email inválido'),
  matricula: z.string().max(20).optional(),
  departamento: z.string().max(100).optional(),
})

export const editarProfessorSchema = criarProfessorSchema.partial()

// ─── Turmas ───────────────────────────────────────────────────────────────────

export const criarTurmaSchema = z.object({
  codigo: z.string().min(2, 'Código deve ter ao menos 2 caracteres').max(30),
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
  semestre: z
    .string()
    .regex(/^\d{4}\/[12]$/, 'Formato: AAAA/1 ou AAAA/2 (ex: 2025/1)'),
  professorId: z.string().cuid('Selecione um professor'),
})

export const editarTurmaSchema = criarTurmaSchema.partial()

// ─── Usuários ─────────────────────────────────────────────────────────────────

export const criarUsuarioSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
  email: z.string().email('Email inválido'),
  senha: z
    .string()
    .min(8, 'Senha deve ter ao menos 8 caracteres')
    .regex(/[A-Z]/, 'Inclua ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Inclua ao menos um número'),
  perfil: z.enum(['APOIO_ACADEMICO', 'OPERADOR_TI', 'ADMINISTRADOR'], {
    error: 'Selecione um perfil',
  }),
})

export const editarUsuarioSchema = z.object({
  nome: z.string().min(3).max(100).optional(),
  perfil: z.enum(['APOIO_ACADEMICO', 'OPERADOR_TI', 'ADMINISTRADOR']).optional(),
  ativo: z.boolean().optional(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type CriarReservaInput     = z.infer<typeof criarReservaSchema>
export type ConfirmarReservaInput = z.infer<typeof confirmarReservaSchema>
export type RejeitarReservaInput  = z.infer<typeof rejeitarReservaSchema>
export type ReagendarReservaInput = z.infer<typeof reagendarReservaSchema>
export type ConfirmarReservaActionInput = z.infer<typeof confirmarReservaActionSchema>
export type RejeitarReservaActionInput  = z.infer<typeof rejeitarReservaActionSchema>
export type ConflitoReservaInput        = z.infer<typeof conflitoReservaSchema>
export type CriarLaboratorioInput = z.infer<typeof criarLaboratorioSchema>
export type EditarLaboratorioInput= z.infer<typeof editarLaboratorioSchema>
export type CriarProfessorInput   = z.infer<typeof criarProfessorSchema>
export type EditarProfessorInput  = z.infer<typeof editarProfessorSchema>
export type CriarTurmaInput       = z.infer<typeof criarTurmaSchema>
export type EditarTurmaInput      = z.infer<typeof editarTurmaSchema>
export type CriarUsuarioInput     = z.infer<typeof criarUsuarioSchema>
export type EditarUsuarioInput    = z.infer<typeof editarUsuarioSchema>