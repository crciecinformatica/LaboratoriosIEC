import { z } from 'zod'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const horaSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Formato: HH:MM')

function horaParaMin(h: string) {
  const [hh, mm] = h.split(':').map(Number)
  return hh * 60 + mm
}

// ─── Entidades manuais ────────────────────────────────────────────────────────

export const professorManualSchema = z.object({
  nome:         z.string().min(3, 'Nome do professor obrigatório').max(100),
  email:        z.string().email('Email inválido'),
  matricula:    z.string().min(1, 'Código de pessoa / matrícula obrigatório').max(20),
  telefone:     z.string().max(20).optional(),
  departamento: z.string().max(100).optional(),
})

export const turmaManualSchema = z.object({
  codigo:           z.string().min(2, 'Código da turma obrigatório').max(30),
  nome:             z.string().min(3, 'Nome da disciplina obrigatório').max(100),
  semestre:         z.string().regex(/^\d{4}\/[12]$/, 'Formato: AAAA/1 ou AAAA/2'),
  curso:            z.string().min(2, 'Curso obrigatório').max(100),
  numOferta:        z.string().max(20).optional(),
  codigoDisciplina: z.string().min(2, 'Código da disciplina obrigatório').max(30),
})

// ─── Schema de item de data (compartilhado) ────────────────────────────────────

const dataItemFormSchema = z
  .object({
    dia:        z.string().min(1, 'Selecione a data'),
    horaInicio: horaSchema,
    horaFim:    horaSchema,
    recorrente: z.boolean().default(false),
  })
  .refine((d) => horaParaMin(d.horaFim) > horaParaMin(d.horaInicio), {
    message: 'Horário de fim deve ser posterior ao de início',
    path: ['horaFim'],
  })

const dataItemApiSchema = z
  .object({
    dia:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD'),
    horaInicio: horaSchema,
    horaFim:    horaSchema,
    recorrente: z.boolean().default(false),
  })
  .refine((d) => horaParaMin(d.horaFim) > horaParaMin(d.horaInicio), {
    message: 'Horário de fim deve ser posterior ao de início',
    path: ['horaFim'],
  })

// ─── Campos base ──────────────────────────────────────────────────────────────

const camposReservaBase = {
  titulo:              z.string().min(5, 'Título deve ter ao mínimo 5 caracteres').max(120),
  modalidadeReserva:   z.enum(['PRESENCIAL', 'REMOTO', 'RAS'], { error: 'Selecione a modalidade' }),
  softwaresUtilizados: z.string().min(2, 'Informe os softwares').max(500),
  numeroAlunos:        z.number({ error: 'Informe o número de alunos' }).int().min(1).max(500),
}

// ─── Schema do FORMULÁRIO (front-end) ─────────────────────────────────────────
// Usa useFieldArray — array de datas com dia/horaInicio/horaFim

export const criarReservaFormSchema = z
  .object({
    ...camposReservaBase,
    professorId:     z.string().optional(),
    turmaId:         z.string().optional(),
    professorManual: professorManualSchema.optional(),
    turmaManual:     turmaManualSchema.optional(),
    datas: z
      .array(
        z.object({
          dia: z.string().min(1, 'Informe a data'),
          horaInicio: z.string().min(1, 'Informe a hora inicial'),
          horaFim: z.string().min(1, 'Informe a hora final'),
          recorrente: z.boolean().default(false),
        })
      )
      .min(1, 'Informe pelo menos uma data'),
    })
  .superRefine((data, ctx) => {
    const temProf  = !!data.professorId || !!data.professorManual
    const temTurma = !!data.turmaId     || !!data.turmaManual
    if (!temProf)
      ctx.addIssue({ code: 'custom', message: 'Informe o professor', path: ['professorId'] })
    if (!temTurma)
      ctx.addIssue({ code: 'custom', message: 'Informe a turma', path: ['turmaId'] })
    if (data.professorId && data.professorManual)
      ctx.addIssue({ code: 'custom', message: 'Use cadastro ou manual, não ambos', path: ['professorManual'] })
    if (data.turmaId && data.turmaManual)
      ctx.addIssue({ code: 'custom', message: 'Use cadastro ou manual, não ambos', path: ['turmaManual'] })
  })

// ─── Schema da API (back-end) ─────────────────────────────────────────────────

const criarReservaBaseObject = z
  .object({
    ...camposReservaBase,
    professorId:     z.string().cuid().optional(),
    turmaId:         z.string().cuid().optional(),
    professorManual: professorManualSchema.optional(),
    turmaManual:     turmaManualSchema.optional(),
    datas:           z.array(dataItemApiSchema).min(1, 'Informe ao menos uma data'),
    nomeSolicitanteExterno: z.string().max(100).optional(),
    emailSolicitanteExterno: z.string().email().optional(),
  })

export const criarReservaSchema = criarReservaBaseObject
  .superRefine((data, ctx) => {
    if (!data.professorId && !data.professorManual)
      ctx.addIssue({ code: 'custom', message: 'Professor obrigatório', path: ['professorId'] })
    if (!data.turmaId && !data.turmaManual)
      ctx.addIssue({ code: 'custom', message: 'Turma obrigatória', path: ['turmaId'] })
  })

// ─── Outros schemas de reserva ────────────────────────────────────────────────

export const confirmarReservaSchema = z.object({
  laboratorioId: z.string().cuid('Laboratório inválido'),
})

export const rejeitarReservaSchema = z.object({
  motivoRejeicao: z.string().min(10, 'Informe o motivo com ao menos 10 caracteres').max(500),
})

export const reagendarReservaSchema = z.object({
  reservaId: z.string().cuid('Reserva inválida'),
  datas:     z.array(dataItemApiSchema).min(1, 'Informe ao menos uma data'),
})

export const confirmarReservaActionSchema = confirmarReservaSchema.extend({
  reservaId: z.string().cuid('Reserva inválida'),
})

export const rejeitarReservaActionSchema = rejeitarReservaSchema.extend({
  reservaId: z.string().cuid('Reserva inválida'),
})

export const conflitoReservaSchema = z.object({
  reservaId: z.string().cuid('Reserva inválida'),
  // Opcional: IDs específicos de DataHorarioReserva a marcar como em conflito.
  // Se omitido ou vazio, mantém o comportamento anterior (marca todas as
  // datas da reserva) — garante retrocompatibilidade com chamadas antigas.
  dataHorarioIds: z.array(z.string().cuid()).optional(),
})

export const corrigirConflitoSchema = z.object({
  reservaId: z.string().cuid('Reserva inválida'),
  datas:     z.array(dataItemApiSchema).min(1),
})

export const uploadAnexoSchema = z.object({
  nomeArquivo: z.string().min(1).max(255),
  mimeType:    z.string().min(1).max(100),
  tamanho:     z.number().int().positive().max(10 * 1024 * 1024, 'Arquivo máximo 10 MB'),
})

// ─── Laboratórios ─────────────────────────────────────────────────────────────

export const criarLaboratorioSchema = z.object({
  nome:       z.string().min(3).max(100),
  codigo:     z.string().min(2).max(20),
  capacidade: z.number({ error: 'Informe a capacidade' }).int().min(1).max(500),
  recursos:   z.array(z.string()).default([]),
  localizacao:z.string().max(200).optional(),
  // ID da agenda do Google Calendar correspondente a este laboratório
  // (ex: "abc123@group.calendar.google.com"). Opcional — laboratórios sem
  // agenda vinculada simplesmente não geram eventos no Calendar.
  googleCalendarId: z.string().max(255).optional().or(z.literal('')),
})
export const editarLaboratorioSchema = criarLaboratorioSchema.partial()

// ─── Professores ──────────────────────────────────────────────────────────────

export const criarProfessorSchema = z.object({
  nome:        z.string().min(3).max(100),
  email:       z.string().email('Email inválido'),
  matricula:   z.string().max(20).optional(),
  telefone:    z.string().max(20).optional(),
  departamento:z.string().max(100).optional(),
})
export const editarProfessorSchema = criarProfessorSchema.partial()

// ─── Turmas ───────────────────────────────────────────────────────────────────

export const criarTurmaSchema = z.object({
  codigo:           z.string().min(2).max(30),
  nome:             z.string().min(3).max(100),
  semestre:         z.string().regex(/^\d{4}\/[12]$/, 'Formato: AAAA/1 ou AAAA/2 (ex: 2025/1)'),
  curso:            z.string().min(2).max(100),
  numOferta:        z.string().max(20).optional(),
  codigoDisciplina: z.string().min(2).max(30),
  professorId:      z.string().cuid('Selecione um professor'),
})
export const editarTurmaSchema = criarTurmaSchema.partial()

// ─── Usuários ─────────────────────────────────────────────────────────────────

export const criarUsuarioSchema = z.object({
  nome:        z.string().min(3).max(100),
  email:       z.string().email('Email inválido'),
  senha:       z.string().min(8).regex(/[A-Z]/, 'Inclua letra maiúscula').regex(/[0-9]/, 'Inclua um número'),
  perfil:      z.enum(['APOIO_ACADEMICO', 'OPERADOR_TI', 'ADMINISTRADOR'], { error: 'Selecione um perfil' }),
  codigoPessoa:z.string().max(50).optional(),
})

export const editarUsuarioSchema = z.object({
  nome:        z.string().min(3).max(100).optional(),
  perfil:      z.enum(['APOIO_ACADEMICO', 'OPERADOR_TI', 'ADMINISTRADOR']).optional(),
  ativo:       z.boolean().optional(),
  codigoPessoa:z.string().max(50).optional(),
})

// ─── Solicitações de acesso ─────────────────────────────────────────────────────

export const solicitarAcessoSchema = z.object({
  nome:         z.string().min(3, 'Informe o nome completo').max(100),
  codigoPessoa: z.string().min(1, 'Informe o código de pessoa').max(50),
  email:        z.string().email('Email inválido'),
  senha:        z.string().min(8, 'A senha deve ter ao menos 8 caracteres')
                  .regex(/[A-Z]/, 'Inclua letra maiúscula')
                  .regex(/[0-9]/, 'Inclua um número'),
})

export const aprovarSolicitacaoAcessoSchema = z.object({
  perfil: z.enum(['APOIO_ACADEMICO', 'OPERADOR_TI', 'ADMINISTRADOR']).optional(),
})

export const negarSolicitacaoAcessoSchema = z.object({
  motivo: z.string().max(500).optional(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type CriarReservaInput     = z.infer<typeof criarReservaSchema>
export type ConfirmarReservaInput = z.infer<typeof confirmarReservaSchema>
export type RejeitarReservaInput  = z.infer<typeof rejeitarReservaSchema>
export type ReagendarReservaInput = z.infer<typeof reagendarReservaSchema>
export type ConfirmarReservaActionInput = z.infer<typeof confirmarReservaActionSchema>
export type RejeitarReservaActionInput  = z.infer<typeof rejeitarReservaActionSchema>
export type ConflitoReservaInput  = z.infer<typeof conflitoReservaSchema>
export type CorrigirConflitoInput = z.infer<typeof corrigirConflitoSchema>
export type ProfessorManualInput  = z.infer<typeof professorManualSchema>
export type TurmaManualInput      = z.infer<typeof turmaManualSchema>
export type CriarLaboratorioInput = z.infer<typeof criarLaboratorioSchema>
export type EditarLaboratorioInput= z.infer<typeof editarLaboratorioSchema>
export type CriarProfessorInput   = z.infer<typeof criarProfessorSchema>
export type EditarProfessorInput  = z.infer<typeof editarProfessorSchema>
export type CriarTurmaInput       = z.infer<typeof criarTurmaSchema>
export type EditarTurmaInput      = z.infer<typeof editarTurmaSchema>
export type CriarUsuarioInput     = z.infer<typeof criarUsuarioSchema>
export type EditarUsuarioInput    = z.infer<typeof editarUsuarioSchema>
export type SolicitarAcessoInput  = z.infer<typeof solicitarAcessoSchema>
export type AprovarSolicitacaoAcessoInput = z.infer<typeof aprovarSolicitacaoAcessoSchema>
export type NegarSolicitacaoAcessoInput   = z.infer<typeof negarSolicitacaoAcessoSchema>

export const criarReservaWebhookSchema = criarReservaBaseObject.extend({
  nomeSolicitanteExterno: z.string().min(3, 'Nome do solicitante é obrigatório no webhook').max(100),
  emailSolicitanteExterno: z.string().email('Email do solicitante inválido no webhook'),
}).superRefine((data, ctx) => {
  if (!data.professorId && !data.professorManual)
    ctx.addIssue({ code: 'custom', message: 'Professor obrigatório', path: ['professorId'] })
  if (!data.turmaId && !data.turmaManual)
    ctx.addIssue({ code: 'custom', message: 'Turma obrigatória', path: ['turmaId'] })
})
export type CriarReservaWebhookInput = z.infer<typeof criarReservaWebhookSchema>
