import { prisma } from '@/lib/prisma/client'
import { TipoEvento, Prisma } from '@prisma/client'
import { abrirChamadoCSC, CscApiError } from '@/lib/integrations/csc'
import {
  notificarTeams,
  TeamsWebhookError,
  TeamsNotificacaoPayload,
} from '@/lib/integrations/teams'

interface Solicitante   { id: string; nome: string; email: string }
interface ProfessorInfo { id: string; nome: string; email: string; telefone?: string | null; departamento?: string | null }
interface TurmaInfo     { id: string; codigo: string; nome: string; curso: string; codigoDisciplina: string; semestre: string, numOferta?: string | null }
interface DataHorario   { dia: Date; horaInicio: string; horaFim: string }

interface ReservaComIncludes {
  id:                  string
  titulo:              string
  modalidadeReserva:   string
  softwaresUtilizados: string
  numeroAlunos:        number
  datas:               DataHorario[]
  solicitante:         Solicitante
  professor:           ProfessorInfo
  turma:               TurmaInfo
}

function sanitizeForJson(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return Prisma.JsonNull
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(sanitizeForJson) as Prisma.InputJsonValue[]
  try { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
  catch { return String(value) }
}

/**
 *Os métodos notificarConfirmacao() e notificarRejeicao() que existiam aqui
 * foram REMOVIDOS. Se uma rota antiga ainda os importar, vai falhar a
 * compilação — isso é proposital, para forçar a limpeza das chamadas nas
 * rotas confirmar/rejeitar/conflito (ver routes correspondentes).
 */
export class IntegracoesService {

  static async notificarCriacao(reservaId: string, operadorId: string): Promise<void> {
    const reserva = await prisma.solicitacaoReserva.findUniqueOrThrow({
      where: { id: reservaId },
      include: {
        solicitante: { select: { id: true, nome: true, email: true } },
        professor:   { select: { id: true, nome: true, email: true, telefone: true, departamento: true } },
        turma:       { select: { id: true, codigo: true, nome: true, curso: true, codigoDisciplina: true, semestre: true, numOferta: true } },
        datas:       { orderBy: { dia: 'asc' } },
      },
    })

    if (reserva.modalidadeReserva !== 'PRESENCIAL') return

    const operador = await prisma.usuario.findUniqueOrThrow({
      where:  { id: operadorId },
      select: { id: true, codigoPessoa: true },
    })

    if (!operador.codigoPessoa) {
      throw new Error(`Operador ${operadorId} sem codigoPessoa configurado.`)
    }

    const descricaoCSC = this._montarDescricaoCSC(reserva)
    let protocolo: string | undefined

    try {
      const resp = await abrirChamadoCSC({ descricao: descricaoCSC, loginSolicitante: operador.codigoPessoa })
      protocolo = resp.protocolo

      await prisma.solicitacaoReserva.update({ where: { id: reservaId }, data: { cscProtocolo: protocolo } })
      await prisma.historicoTramitacao.create({
        data: { reservaId, usuarioId: operadorId, evento: TipoEvento.ENVIO_CSC, metadados: { protocolo } },
      })
      await prisma.logIntegracao.create({
        data: {
          servico: 'CSC', endpoint: process.env.CSC_API_URL ?? '', metodo: 'POST', statusHttp: 200,
          payload: { Descricao: descricaoCSC.substring(0, 200), LoginSolicitante: operador.codigoPessoa },
          resposta: { protocolo },
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.logIntegracao.create({
        data: {
          servico: 'CSC', endpoint: process.env.CSC_API_URL ?? '', metodo: 'POST',
          statusHttp: err instanceof CscApiError ? err.statusHttp : undefined,
          payload: { Descricao: descricaoCSC.substring(0, 200), LoginSolicitante: operador.codigoPessoa },
          erro: msg,
          ...(err instanceof CscApiError && err.responseBody ? { resposta: sanitizeForJson(err.responseBody) } : {}),
        },
      })
      throw err
    }

    await this._enviarTeams(reservaId, operadorId,
      this._montarPayloadTeams(reserva, 'CRIACAO', { cscProtocolo: protocolo }))
  }

  private static async _enviarTeams(reservaId: string, usuarioId: string, payload: TeamsNotificacaoPayload) {
    try {
      await notificarTeams(payload)
      await prisma.logIntegracao.create({
        data: { servico: 'TEAMS', endpoint: process.env.TEAMS_WEBHOOK_URL ?? '', metodo: 'POST', statusHttp: 202, payload: { reservaId, evento: payload.evento } },
      })
      await prisma.historicoTramitacao.create({
        data: { reservaId, usuarioId, evento: TipoEvento.NOTIFICACAO_TEAMS, observacao: `Notificação ${payload.evento} enviada ao Teams` },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.logIntegracao.create({
        data: {
          servico: 'TEAMS', endpoint: process.env.TEAMS_WEBHOOK_URL ?? '', metodo: 'POST',
          statusHttp: err instanceof TeamsWebhookError ? err.statusHttp : undefined,
          payload: { reservaId, evento: payload.evento }, erro: msg,
          ...(err instanceof TeamsWebhookError && err.responseBody ? { resposta: sanitizeForJson(err.responseBody) } : {}),
        },
      })
      console.error(`[Teams] Falha ${payload.evento}:`, msg)
    }
  }

  private static _montarDescricaoCSC(reserva: ReservaComIncludes): string {
    const linhasDatas = reserva.datas.map((d) => {
      const dia = new Intl.DateTimeFormat('pt-BR').format(d.dia)
      return `- ${dia} das ${d.horaInicio} às ${d.horaFim}`
    }).join('\n')

    return [
      'Solicitação de Reserva de Laboratório',
      '',
      `Título: ${reserva.titulo}`,
      `Modalidade: ${reserva.modalidadeReserva}`,
      `Softwares: ${reserva.softwaresUtilizados}`,
      `Nº alunos: ${reserva.numeroAlunos}`,
      '',
      `Professor: ${reserva.professor.nome}`,
      `E-mail: ${reserva.professor.email}`,
      reserva.professor.telefone    ? `Telefone: ${reserva.professor.telefone}` : '',
      reserva.professor.departamento? `Depto: ${reserva.professor.departamento}` : '',
      '',
      `Turma: ${reserva.turma.codigo} — ${reserva.turma.nome}`,
      `Curso: ${reserva.turma.curso}`,
      `Disciplina: ${reserva.turma.codigoDisciplina}`,
      `Semestre: ${reserva.turma.semestre}`,
      '',
      'Datas solicitadas:',
      linhasDatas,
      '',
      `Solicitante: ${reserva.solicitante.nome} (${reserva.solicitante.email})`,
    ].filter((l) => l !== null).join('\n')
  }

  private static _montarPayloadTeams(
    reserva: ReservaComIncludes,
    evento: 'CRIACAO',
    extras: { cscProtocolo?: string } = {}
  ): TeamsNotificacaoPayload {
    return {
      titulo:       reserva.titulo,
      reservaId:    reserva.id,
      solicitante:  reserva.solicitante.nome,
      professor:    reserva.professor.nome,
      modalidade:   reserva.modalidadeReserva as 'PRESENCIAL' | 'REMOTO' | 'RAS',
      softwares:    reserva.softwaresUtilizados,
      numeroAlunos: reserva.numeroAlunos,
      datas:        reserva.datas.map((d) => ({ dia: d.dia, horaInicio: d.horaInicio, horaFim: d.horaFim })),
      evento,
      curso: reserva.turma.curso,
      disciplina: reserva.turma.nome,
      codigoDisciplina: reserva.turma.codigoDisciplina,
      semestre: reserva.turma.semestre,
      turma: reserva.turma.codigo,
      numOferta: reserva.turma.numOferta,
      ...(extras.cscProtocolo && { cscProtocolo: extras.cscProtocolo }),
    }
  }
}