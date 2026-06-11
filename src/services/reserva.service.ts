import { prisma } from '@/lib/prisma/client'
import { StatusReserva, TipoEvento } from '@prisma/client'
import { transicaoValida } from '@/types'
import type {
  CriarReservaInput,
  ConfirmarReservaInput,
  RejeitarReservaInput,
} from '@/lib/validations/reserva'

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export class ReservaService {
  static async criar(input: CriarReservaInput, solicitanteId: string) {
    return prisma.$transaction(async (tx) => {
      const professorId = await this._resolverProfessor(tx, input)
      const turmaId = await this._resolverTurma(tx, input, professorId)

      // Converte "2025-08-15" + "08:00" em DateTime UTC
      const diaDate = new Date(`${input.dia}T00:00:00.000Z`)

      const reserva = await tx.solicitacaoReserva.create({
        data: {
          titulo:               input.titulo,
          modalidadeReserva:    input.modalidadeReserva,
          softwaresUtilizados:  input.softwaresUtilizados,
          numeroAlunos:         input.numeroAlunos,
          status:               'AGUARDANDO_CONFIRMACAO',
          solicitanteId,
          professorId,
          turmaId,
          dia:        diaDate,
          horaInicio: input.horaInicio,
          horaFim:    input.horaFim,
        },
        include: {
          professor:  true,
          turma:      true,
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

    const existe = await tx.professor.findUnique({
      where: { email: input.professorManual.email },
    })
    if (existe) return existe.id

    const professor = await tx.professor.create({
      data: {
        nome:         input.professorManual.nome,
        email:        input.professorManual.email,
        matricula:    input.professorManual.matricula,
        telefone:     input.professorManual.telefone,
        departamento: input.professorManual.departamento,
      },
    })
    return professor.id
  }

  private static async _resolverTurma(
    tx: Tx,
    input: CriarReservaInput,
    professorId: string
  ): Promise<string> {
    if (input.turmaId) return input.turmaId
    if (!input.turmaManual) throw new Error('Turma obrigatória')

    const existe = await tx.turma.findUnique({
      where: { codigo: input.turmaManual.codigo },
    })
    if (existe) return existe.id

    const turma = await tx.turma.create({
      data: {
        codigo:           input.turmaManual.codigo,
        nome:             input.turmaManual.nome,
        semestre:         input.turmaManual.semestre,
        curso:            input.turmaManual.curso,
        numOferta:        input.turmaManual.numOferta,
        codigoDisciplina: input.turmaManual.codigoDisciplina,
        professorId,
      },
    })
    return turma.id
  }

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

  static async reagendar(
    reservaId: string,
    dia: string,
    horaInicio: string,
    horaFim: string,
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

      await tx.solicitacaoReserva.update({
        where: { id: reservaId },
        data: {
          dia:        new Date(`${dia}T00:00:00.000Z`),
          horaInicio,
          horaFim,
          status:     'AGUARDANDO_CONFIRMACAO',
        },
      })

      await tx.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId:    operadorId,
          evento:       TipoEvento.REAGENDAMENTO,
          statusAntes:  reserva.status,
          statusDepois: 'AGUARDANDO_CONFIRMACAO',
          observacao:   'Reagendamento de data/horário',
        },
      })
    })
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
          statusAntes:  reserva.status,
          statusDepois: novoStatus,
          observacao,
        },
      })
    })
  }
}