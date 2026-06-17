import { prisma } from '@/lib/prisma/client'
import { StatusReserva, TipoEvento } from '@prisma/client'
import { transicaoValida } from '@/types'
import { ConflitosService } from './conflito.service'
import type {
  CriarReservaInput,
  ConfirmarReservaInput,
  RejeitarReservaInput,
  CorrigirConflitoInput,
} from '@/lib/validations/reserva'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Converte "YYYY-MM-DD" → Date (meia-noite UTC)
function parseDia(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`)
}

export class ReservaService {

  static async criar(input: CriarReservaInput, solicitanteId: string) {
    return prisma.$transaction(async (tx) => {
      const professorId = await this._resolverProfessor(tx, input)
      const turmaId     = await this._resolverTurma(tx, input, professorId)

      const reserva = await tx.solicitacaoReserva.create({
        data: {
          titulo:              input.titulo,
          modalidadeReserva:   input.modalidadeReserva,
          softwaresUtilizados: input.softwaresUtilizados,
          numeroAlunos:        input.numeroAlunos,
          status:              'AGUARDANDO_CONFIRMACAO',
          solicitanteId,
          professorId,
          turmaId,
          datas: {
            create: input.datas.map((d) => ({
              dia:        parseDia(d.dia),
              horaInicio: d.horaInicio,
              horaFim:    d.horaFim,
              recorrente: d.recorrente ?? false,
            })),
          },
        },
        include: {
          professor:   true,
          turma:       true,
          datas:       true,
          solicitante: { select: { id: true, nome: true, email: true } },
        },
      })

      await tx.historicoTramitacao.create({
        data: {
          reservaId:    reserva.id,
          usuarioId:    solicitanteId,
          evento:       TipoEvento.CRIACAO,
          statusAntes:  'CRIADA',
          statusDepois: 'AGUARDANDO_CONFIRMACAO',
        },
      })

      return reserva
    })
  }

  /**
   * Fase 8 — Confirmação com isolamento SERIALIZÁVEL.
   *
   * Garante que mesmo duas chamadas simultâneas não confirmem a mesma reserva
   * duas vezes ou criem dupla ocupação de laboratório/horário.
   *
   * O banco levanta SerializationFailure se detectar write skew,
   * e o Prisma lança P2034 — tratado na rota com retry ou 409.
   */
  static async confirmar(
    reservaId:    string,
    input:        ConfirmarReservaInput,
    operadorId:   string
  ) {
    return prisma.$transaction(
      async (tx) => {
        const reserva = await tx.solicitacaoReserva.findUniqueOrThrow({
          where:  { id: reservaId },
          select: { status: true },
        })

        if (!transicaoValida(reserva.status, 'CONFIRMADA')) {
          throw new Error(`Transição inválida: ${reserva.status} → CONFIRMADA`)
        }

        // Verifica conflito dentro da transação serializada
        const datas = await tx.dataHorarioReserva.findMany({
          where:  { reservaId },
          select: { dia: true, horaInicio: true, horaFim: true },
        })

        const resultado = await ConflitosService.detectarConflitos(
          input.laboratorioId,
          datas,
          reservaId
        )

        if (resultado.temConflito) {
          const detalhes = resultado.datasEmConflito
            .map((d) => {
              const dia = new Intl.DateTimeFormat('pt-BR').format(d.dia)
              return `${dia} ${d.horaInicio}–${d.horaFim}`
            })
            .join(', ')
          throw new Error(`Conflito de datas: ${detalhes}`)
        }

        await tx.solicitacaoReserva.update({
          where: { id: reservaId },
          data:  { laboratorioId: input.laboratorioId, status: 'CONFIRMADA' },
        })

        await tx.historicoTramitacao.create({
          data: {
            reservaId,
            usuarioId:    operadorId,
            evento:       TipoEvento.CONFIRMACAO,
            statusAntes:  reserva.status,
            statusDepois: 'CONFIRMADA',
          },
        })
      },
      { isolationLevel: 'Serializable' }
    )
  }

  static async rejeitar(reservaId: string, input: RejeitarReservaInput, operadorId: string) {
    return this._transitar(reservaId, 'REJEITADA', operadorId, async (tx) => {
      await tx.solicitacaoReserva.update({
        where: { id: reservaId },
        data:  { status: 'REJEITADA', motivoRejeicao: input.motivoRejeicao },
      })
    }, TipoEvento.REJEICAO, input.motivoRejeicao)
  }

  /**
   * Reagenda: substitui todas as datas da reserva e volta para AGUARDANDO_CONFIRMACAO.
   */
  static async reagendar(
    reservaId:  string,
    novasDatas: { dia: string; horaInicio: string; horaFim: string; recorrente?: boolean }[],
    operadorId: string
  ) {
    return prisma.$transaction(async (tx) => {
      const reserva = await tx.solicitacaoReserva.findUniqueOrThrow({
        where:  { id: reservaId },
        select: { status: true },
      })

      if (!transicaoValida(reserva.status, 'AGUARDANDO_CONFIRMACAO')) {
        throw new Error(`Não é possível reagendar no estado ${reserva.status}`)
      }

      await tx.dataHorarioReserva.deleteMany({ where: { reservaId } })
      await tx.dataHorarioReserva.createMany({
        data: novasDatas.map((d) => ({
          reservaId,
          dia:        parseDia(d.dia),
          horaInicio: d.horaInicio,
          horaFim:    d.horaFim,
          recorrente: d.recorrente ?? false,
          emConflito: false,
        })),
      })

      await tx.solicitacaoReserva.update({
        where: { id: reservaId },
        data:  { status: 'AGUARDANDO_CONFIRMACAO' },
      })

      await tx.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId:    operadorId,
          evento:       TipoEvento.REAGENDAMENTO,
          statusAntes:  reserva.status,
          statusDepois: 'AGUARDANDO_CONFIRMACAO',
          observacao:   `Reagendamento: ${novasDatas.length} data(s)`,
        },
      })
    })
  }

  /**
   * Corrigir conflito: substituição das datas pelo solicitante após notificação de conflito.
   * Equivalente ao reagendar, mas disparado pelo APOIO_ACADEMICO, não pelo operador.
   */
  static async corrigirConflito(input: CorrigirConflitoInput, usuarioId: string) {
    return this.reagendar(input.reservaId, input.datas, usuarioId)
  }

  /**
   * Verifica conflito de datas (compatibilidade com Sprint 5 — use ConflitosService para detalhes).
   */
  static async verificarConflitoDatas(
    laboratorioId: string,
    datas: { dia: Date; horaInicio: string; horaFim: string }[],
    excluirReservaId?: string
  ): Promise<boolean> {
    const resultado = await ConflitosService.detectarConflitos(laboratorioId, datas, excluirReservaId)
    return resultado.temConflito
  }

  private static async _resolverProfessor(tx: Tx, input: CriarReservaInput): Promise<string> {
    if (input.professorId) return input.professorId
    if (!input.professorManual) throw new Error('Professor obrigatório')
    const existe = await tx.professor.findUnique({ where: { email: input.professorManual.email } })
    if (existe) return existe.id
    const prof = await tx.professor.create({ data: { ...input.professorManual } })
    return prof.id
  }

  private static async _resolverTurma(tx: Tx, input: CriarReservaInput, professorId: string): Promise<string> {
    if (input.turmaId) return input.turmaId
    if (!input.turmaManual) throw new Error('Turma obrigatória')
    const existe = await tx.turma.findUnique({ where: { codigo: input.turmaManual.codigo } })
    if (existe) return existe.id
    const turma = await tx.turma.create({ data: { ...input.turmaManual, professorId } })
    return turma.id
  }

  private static async _transitar(
    reservaId:  string,
    novoStatus: StatusReserva,
    usuarioId:  string,
    updater:    (tx: Tx) => Promise<void>,
    evento:     TipoEvento,
    observacao?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const reserva = await tx.solicitacaoReserva.findUniqueOrThrow({
        where:  { id: reservaId },
        select: { status: true },
      })

      if (!transicaoValida(reserva.status, novoStatus)) {
        throw new Error(`Transição inválida: ${reserva.status} → ${novoStatus}`)
      }

      await updater(tx)

      await tx.historicoTramitacao.create({
        data: { reservaId, usuarioId, evento, statusAntes: reserva.status, statusDepois: novoStatus, observacao },
      })
    })
  }
}
