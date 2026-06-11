import { prisma } from '@/lib/prisma/client'
import { StatusReserva, TipoEvento } from '@prisma/client'
import { transicaoValida } from '@/types'
import type {
  CriarReservaInput,
  ConfirmarReservaInput,
  RejeitarReservaInput,
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

  static async confirmar(reservaId: string, input: ConfirmarReservaInput, operadorId: string) {
    return this._transitar(reservaId, 'CONFIRMADA', operadorId, async (tx) => {
      await tx.solicitacaoReserva.update({
        where: { id: reservaId },
        data:  { laboratorioId: input.laboratorioId, status: 'CONFIRMADA' },
      })
    }, TipoEvento.CONFIRMACAO)
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
    reservaId: string,
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

      // Remove datas antigas e insere novas
      await tx.dataHorarioReserva.deleteMany({ where: { reservaId } })
      await tx.dataHorarioReserva.createMany({
        data: novasDatas.map((d) => ({
          reservaId,
          dia:        parseDia(d.dia),
          horaInicio: d.horaInicio,
          horaFim:    d.horaFim,
          recorrente: d.recorrente ?? false,
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
   * Verifica se há conflito de horário para um laboratório.
   * Confronta TODAS as datas da reserva candidata contra as confirmadas/aguardando do lab.
   */
  static async verificarConflitoDatas(
    laboratorioId: string,
    datas: { dia: Date; horaInicio: string; horaFim: string }[],
    excluirReservaId?: string
  ): Promise<boolean> {
    for (const d of datas) {
      const conflito = await prisma.dataHorarioReserva.findFirst({
        where: {
          reserva: {
            laboratorioId,
            status: { in: ['AGUARDANDO_CONFIRMACAO', 'CONFIRMADA'] },
            ...(excluirReservaId ? { id: { not: excluirReservaId } } : {}),
          },
          dia: d.dia,
          // sobreposição de horário
          AND: [
            { horaInicio: { lt: d.horaFim } },
            { horaFim:    { gt: d.horaInicio } },
          ],
        },
      })
      if (conflito) return true
    }
    return false
  }

  private static async _transitar(
    reservaId: string,
    novoStatus: StatusReserva,
    usuarioId: string,
    updater: (tx: Tx) => Promise<void>,
    evento: TipoEvento,
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