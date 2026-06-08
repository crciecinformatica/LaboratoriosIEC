import { prisma } from '@/lib/prisma/client'
import { StatusReserva, TipoEvento } from '@prisma/client'
import { transicaoValida } from '@/types'
import type {
  CriarReservaInput,
  ConfirmarReservaInput,
  RejeitarReservaInput,
  CorrigirConflitoInput,
} from '@/lib/validations/reserva'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export class ReservaService {
  static async criar(input: CriarReservaInput, solicitanteId: string) {
    return prisma.$transaction(async (tx) => {
      const professorId = await this._resolverProfessor(tx, input)
      const turmaId = await this._resolverTurma(tx, input, professorId)

      const reserva = await tx.solicitacaoReserva.create({
        data: {
          titulo: input.titulo,
          modalidadeReserva: input.modalidadeReserva,
          softwaresUtilizados: input.softwaresUtilizados,
          numeroAlunos: input.numeroAlunos,
          status: 'AGUARDANDO_CONFIRMACAO',
          solicitanteId,
          professorId,
          turmaId,
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

  private static async _resolverProfessor(tx: Tx, input: CriarReservaInput): Promise<string> {
    if (input.professorId) return input.professorId

    if (!input.professorManual) throw new Error('Professor obrigatório')

    const existe = await tx.professor.findUnique({ where: { email: input.professorManual.email } })
    if (existe) return existe.id

    const professor = await tx.professor.create({
      data: {
        nome: input.professorManual.nome,
        email: input.professorManual.email,
        matricula: input.professorManual.matricula,
        telefone: input.professorManual.telefone,
        departamento: input.professorManual.departamento,
      },
    })
    return professor.id
  }

  private static async _resolverTurma(tx: Tx, input: CriarReservaInput, professorId: string): Promise<string> {
    if (input.turmaId) return input.turmaId

    if (!input.turmaManual) throw new Error('Turma obrigatória')

    const existe = await tx.turma.findUnique({ where: { codigo: input.turmaManual.codigo } })
    if (existe) return existe.id

    const turma = await tx.turma.create({
      data: {
        codigo: input.turmaManual.codigo,
        nome: input.turmaManual.nome,
        semestre: input.turmaManual.semestre,
        curso: input.turmaManual.curso,
        numOferta: input.turmaManual.numOferta,
        codigoDisciplina: input.turmaManual.codigoDisciplina,
        professorId,
      },
    })
    return turma.id
  }

  static async confirmar(reservaId: string, input: ConfirmarReservaInput, operadorId: string) {
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

  static async rejeitar(reservaId: string, input: RejeitarReservaInput, operadorId: string) {
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

  static async marcarConflito(reservaId: string, dataHorarioIds: string[], operadorId: string) {
    return prisma.$transaction(async (tx) => {
      const reserva = await tx.solicitacaoReserva.findUniqueOrThrow({
        where: { id: reservaId },
        select: { status: true },
      })

      if (!transicaoValida(reserva.status, 'CONFLITO_DE_DATAS')) {
        throw new Error(`Transição inválida: ${reserva.status} → CONFLITO_DE_DATAS`)
      }

      const datas = await tx.dataHorarioReserva.findMany({
        where: { reservaId, id: { in: dataHorarioIds } },
      })
      if (datas.length !== dataHorarioIds.length) {
        throw new Error('Uma ou mais datas não pertencem à reserva')
      }

      await tx.dataHorarioReserva.updateMany({
        where: { reservaId },
        data: { emConflito: false },
      })
      await tx.dataHorarioReserva.updateMany({
        where: { id: { in: dataHorarioIds } },
        data: { emConflito: true },
      })

      await tx.solicitacaoReserva.update({
        where: { id: reservaId },
        data: { status: 'CONFLITO_DE_DATAS' },
      })

      const descricaoDatas = datas
        .map((d) => new Date(d.dataInicio).toLocaleString('pt-BR'))
        .join(', ')

      await tx.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId: operadorId,
          evento: TipoEvento.CONFLITO_DETECTADO,
          statusAntes: reserva.status,
          statusDepois: 'CONFLITO_DE_DATAS',
          observacao: `Conflito nas datas: ${descricaoDatas}`,
          metadados: { dataHorarioIds },
        },
      })
    })
  }

  static async corrigirConflito(input: CorrigirConflitoInput, solicitanteId: string) {
    return prisma.$transaction(async (tx) => {
      const reserva = await tx.solicitacaoReserva.findUniqueOrThrow({
        where: { id: input.reservaId },
        select: { status: true, solicitanteId: true },
      })

      if (reserva.status !== 'CONFLITO_DE_DATAS') {
        throw new Error('Reserva não está em conflito de datas')
      }

      for (const correcao of input.correcoes) {
        const data = await tx.dataHorarioReserva.findFirst({
          where: {
            id: correcao.dataHorarioId,
            reservaId: input.reservaId,
            emConflito: true,
          },
        })
        if (!data) throw new Error('Data em conflito não encontrada')

        await tx.dataHorarioReserva.update({
          where: { id: correcao.dataHorarioId },
          data: {
            dataInicio: new Date(correcao.dataInicio),
            dataFim: new Date(correcao.dataFim),
            emConflito: false,
          },
        })
      }

      const pendentes = await tx.dataHorarioReserva.count({
        where: { reservaId: input.reservaId, emConflito: true },
      })

      if (pendentes === 0) {
        await tx.solicitacaoReserva.update({
          where: { id: input.reservaId },
          data: { status: 'AGUARDANDO_CONFIRMACAO' },
        })

        await tx.historicoTramitacao.create({
          data: {
            reservaId: input.reservaId,
            usuarioId: solicitanteId,
            evento: TipoEvento.REAGENDAMENTO,
            statusAntes: 'CONFLITO_DE_DATAS',
            statusDepois: 'AGUARDANDO_CONFIRMACAO',
            observacao: 'Datas corrigidas pelo apoio acadêmico',
          },
        })
      }
    })
  }

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
        where: { id: reservaId },
        select: { status: true },
      })

      if (!transicaoValida(reserva.status, novoStatus)) {
        throw new Error(`Transição inválida: ${reserva.status} → ${novoStatus}`)
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
