import { prisma } from '@/lib/prisma/client'
import { StatusReserva, TipoEvento } from '@prisma/client'
import { transicaoValida } from '@/types'
import type {
  CriarReservaInput,
  ConfirmarReservaInput,
  RejeitarReservaInput,
} from '@/lib/validations/reserva'

export class ReservaService {
  /**
   * Cria reserva e avança para AGUARDANDO_CONFIRMACAO.
   * Registra primeiro evento no histórico de tramitação.
   */
  static async criar(input: CriarReservaInput, solicitanteId: string) {
    return prisma.$transaction(async (tx) => {
      const reserva = await tx.solicitacaoReserva.create({
        data: {
          titulo: input.titulo,
          descricao: input.descricao,
          status: 'AGUARDANDO_CONFIRMACAO',
          solicitanteId,
          professorId: input.professorId,
          turmaId: input.turmaId,
          datas: {
            create: input.datas.map((d) => ({
              dataInicio: new Date(d.dataInicio),
              dataFim: new Date(d.dataFim),
              recorrente: d.recorrente,
            })),
          },
        },
        include: {
          datas: true,
          professor: true,
          turma: true,
          solicitante: { select: { id: true, nome: true, email: true } },
        },
      })

      await tx.historicoTramitacao.create({
        data: {
          reservaId: reserva.id,
          usuarioId: solicitanteId,
          evento: TipoEvento.CRIACAO,
          statusAntes: 'CRIADA',
          statusDepois: 'AGUARDANDO_CONFIRMACAO',
        },
      })

      return reserva
    })
  }

  /**
   * Confirma reserva: AGUARDANDO_CONFIRMACAO → CONFIRMADA.
   * Vincula laboratório escolhido pelo operador.
   */
  static async confirmar(
    reservaId: string,
    input: ConfirmarReservaInput,
    operadorId: string
  ) {
    return this._transitar(
      reservaId,
      'CONFIRMADA',
      operadorId,
      async (tx) => {
        await tx.solicitacaoReserva.update({
          where: { id: reservaId },
          data: { laboratorioId: input.laboratorioId, status: 'CONFIRMADA' },
        })
      },
      TipoEvento.CONFIRMACAO
    )
  }

  /**
   * Rejeita reserva com motivo obrigatório.
   */
  static async rejeitar(
    reservaId: string,
    input: RejeitarReservaInput,
    operadorId: string
  ) {
    return this._transitar(
      reservaId,
      'REJEITADA',
      operadorId,
      async (tx) => {
        await tx.solicitacaoReserva.update({
          where: { id: reservaId },
          data: { status: 'REJEITADA', motivoRejeicao: input.motivoRejeicao },
        })
      },
      TipoEvento.REJEICAO,
      input.motivoRejeicao
    )
  }

  /**
   * Marca conflito de datas detectado pelo operador ou sistema.
   */
  static async marcarConflito(reservaId: string, operadorId: string) {
    return this._transitar(
      reservaId,
      'CONFLITO_DE_DATAS',
      operadorId,
      async (tx) => {
        await tx.solicitacaoReserva.update({
          where: { id: reservaId },
          data: { status: 'CONFLITO_DE_DATAS' },
        })
      },
      TipoEvento.CONFLITO_DETECTADO
    )
  }

  /**
   * Reagenda: CONFLITO_DE_DATAS → AGUARDANDO_CONFIRMACAO com novas datas.
   */
  static async reagendar(
    reservaId: string,
    novasDatas: CriarReservaInput['datas'],
    operadorId: string
  ) {
    return prisma.$transaction(async (tx) => {
      const reserva = await tx.solicitacaoReserva.findUniqueOrThrow({
        where: { id: reservaId },
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
          dataInicio: new Date(d.dataInicio),
          dataFim: new Date(d.dataFim),
          recorrente: d.recorrente,
        })),
      })

      await tx.solicitacaoReserva.update({
        where: { id: reservaId },
        data: { status: 'AGUARDANDO_CONFIRMACAO' },
      })

      await tx.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId: operadorId,
          evento: TipoEvento.REAGENDAMENTO,
          statusAntes: reserva.status,
          statusDepois: 'AGUARDANDO_CONFIRMACAO',
          observacao: 'Reagendamento após conflito de datas',
        },
      })
    })
  }

  /**
   * Verifica se há sobreposição de horário para um laboratório.
   * Usado antes de confirmar para detectar conflito.
   */
  static async verificarConflitoDatas(
    laboratorioId: string,
    datas: { dataInicio: Date; dataFim: Date }[],
    excluirReservaId?: string
  ): Promise<boolean> {
    for (const data of datas) {
      const conflito = await prisma.dataHorarioReserva.findFirst({
        where: {
          reserva: {
            laboratorioId,
            status: { in: ['AGUARDANDO_CONFIRMACAO', 'CONFIRMADA'] },
            ...(excluirReservaId ? { id: { not: excluirReservaId } } : {}),
          },
          OR: [
            { dataInicio: { lt: data.dataFim }, dataFim: { gt: data.dataInicio } },
          ],
        },
      })
      if (conflito) return true
    }
    return false
  }

  // ─── Helper interno ────────────────────────────────────────────────────────

  private static async _transitar(
    reservaId: string,
    novoStatus: StatusReserva,
    usuarioId: string,
    updater: (
      tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
    ) => Promise<void>,
    evento: TipoEvento,
    observacao?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const reserva = await tx.solicitacaoReserva.findUniqueOrThrow({
        where: { id: reservaId },
        select: { status: true },
      })

      if (!transicaoValida(reserva.status, novoStatus)) {
        throw new Error(
          `Transição inválida: ${reserva.status} → ${novoStatus}`
        )
      }

      await updater(tx)

      await tx.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId,
          evento,
          statusAntes: reserva.status,
          statusDepois: novoStatus,
          observacao,
        },
      })
    })
  }
}
