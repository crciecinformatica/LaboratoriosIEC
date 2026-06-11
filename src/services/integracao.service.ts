import { prisma } from '@/lib/prisma/client'
import { TipoEvento, Prisma } from '@prisma/client'
import { abrirChamadoCSC, CscApiError } from '@/lib/integrations/csc'
import {
  notificarTeams,
  TeamsWebhookError,
  TeamsNotificacaoPayload,
  TipoEvento as TipoEventoTeams,
} from '@/lib/integrations/teams'

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface Solicitante   { id: string; nome: string; email: string }
interface ProfessorInfo { id: string; nome: string; email: string; telefone?: string | null; departamento?: string | null }
interface TurmaInfo     { id: string; codigo: string; nome: string; curso: string; codigoDisciplina: string; semestre: string }
interface LaboratorioInfo { id: string; nome: string }

interface ReservaComIncludes {
  id:                  string
  titulo:              string
  modalidadeReserva:   string
  softwaresUtilizados: string
  numeroAlunos:        number
  dia:                 Date
  horaInicio:          string
  horaFim:             string
  solicitante:         Solicitante
  professor:           ProfessorInfo
  turma:               TurmaInfo
  laboratorio?:        LaboratorioInfo | null
}

function sanitizeForJson(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return Prisma.JsonNull
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(sanitizeForJson) as Prisma.InputJsonValue[]
  try { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
  catch { return String(value) }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class IntegracoesService {

  // ── Criação: CSC + Teams (apenas PRESENCIAL) ──────────────────────────────

  static async notificarCriacao(reservaId: string, operadorId: string): Promise<void> {
    const reserva = await prisma.solicitacaoReserva.findUniqueOrThrow({
      where: { id: reservaId },
      include: {
        solicitante: { select: { id: true, nome: true, email: true } },
        professor:   { select: { id: true, nome: true, email: true, telefone: true, departamento: true } },
        turma:       { select: { id: true, codigo: true, nome: true, curso: true, codigoDisciplina: true, semestre: true, numOferta: true } },
      },
    })

    if (reserva.modalidadeReserva !== 'PRESENCIAL') return

    // ── CSC ──
    const operador = await prisma.usuario.findUniqueOrThrow({
      where: { id: operadorId },
      select: { id: true, codigoPessoa: true },
    })

    if (!operador.codigoPessoa) {
      throw new Error(
        `Operador ${operadorId} sem codigoPessoa configurado. Configure o código PUC na tela de usuários.`
      )
    }

    const descricaoCSC = this._montarDescricaoCSC(reserva)
    let protocolo: string | undefined

    try {
      const resp = await abrirChamadoCSC({
        descricao:        descricaoCSC,
        loginSolicitante: operador.codigoPessoa,
      })
      protocolo = resp.protocolo

      await prisma.solicitacaoReserva.update({
        where: { id: reservaId },
        data:  { cscProtocolo: protocolo },
      })

      await prisma.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId: operadorId,
          evento:    TipoEvento.ENVIO_CSC,
          metadados: { protocolo },
        },
      })

      await prisma.logIntegracao.create({
        data: {
          servico:   'CSC',
          endpoint:  process.env.CSC_API_URL ?? 'CSC_API_URL',
          metodo:    'POST',
          statusHttp: 200,
          payload: {
            CatalogoServicosid: Number(process.env.CSC_CATALOGO_ID),
            Descricao:          descricaoCSC.substring(0, 200),
            LoginSolicitante:   operador.codigoPessoa,
            flexfield103:       Number(process.env.CSC_FLEX_FIELD_103),
          },
          resposta: { protocolo },
        },
      })
    } catch (err) {
      const msg        = err instanceof Error ? err.message : String(err)
      const statusHttp = err instanceof CscApiError ? err.statusHttp : undefined
      const logData: Prisma.LogIntegracaoCreateInput = {
        servico:   'CSC',
        endpoint:  process.env.CSC_API_URL ?? 'CSC_API_URL',
        metodo:    'POST',
        statusHttp,
        payload: {
          CatalogoServicosid: Number(process.env.CSC_CATALOGO_ID),
          Descricao:          descricaoCSC.substring(0, 200),
          LoginSolicitante:   operador.codigoPessoa,
          flexfield103:       Number(process.env.CSC_FLEX_FIELD_103),
        },
        erro: msg,
        ...(err instanceof CscApiError && err.responseBody
          ? { resposta: sanitizeForJson(err.responseBody) }
          : {}),
      }
      await prisma.logIntegracao.create({ data: logData })
      throw err // propaga — criação de reserva não falha silenciosamente por CSC
    }

    // ── Teams ──
    await this._enviarTeams(
      reservaId,
      operadorId,
      this._montarPayloadTeams(reserva, 'CRIACAO', { cscProtocolo: protocolo })
    )
  }

  // ── Confirmação: Teams (apenas PRESENCIAL) ────────────────────────────────

  static async notificarConfirmacao(reservaId: string): Promise<void> {
    const reserva = await prisma.solicitacaoReserva.findUniqueOrThrow({
      where: { id: reservaId },
      include: {
        solicitante: { select: { id: true, nome: true, email: true } },
        professor:   { select: { id: true, nome: true, email: true, telefone: true, departamento: true } },
        turma:       { select: { id: true, codigo: true, nome: true, curso: true, codigoDisciplina: true, semestre: true } },
        laboratorio: { select: { id: true, nome: true } },
      },
    })

    if (reserva.modalidadeReserva !== 'PRESENCIAL') return

    const operadorId = await this._ultimoOperadorId(reservaId)
    if (!operadorId) return

    await this._enviarTeams(
      reservaId,
      operadorId,
      this._montarPayloadTeams(reserva, 'CONFIRMACAO', { laboratorio: reserva.laboratorio?.nome })
    )
  }

  // ── Rejeição: Teams (apenas PRESENCIAL) ──────────────────────────────────

  static async notificarRejeicao(reservaId: string, motivoRejeicao: string): Promise<void> {
    const reserva = await prisma.solicitacaoReserva.findUniqueOrThrow({
      where: { id: reservaId },
      include: {
        solicitante: { select: { id: true, nome: true, email: true } },
        professor:   { select: { id: true, nome: true, email: true, telefone: true, departamento: true } },
        turma:       { select: { id: true, codigo: true, nome: true, curso: true, codigoDisciplina: true, semestre: true } },
      },
    })

    if (reserva.modalidadeReserva !== 'PRESENCIAL') return

    const operadorId = await this._ultimoOperadorId(reservaId)
    if (!operadorId) return

    await this._enviarTeams(
      reservaId,
      operadorId,
      this._montarPayloadTeams(reserva, 'REJEICAO', { motivoRejeicao })
    )
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private static async _ultimoOperadorId(reservaId: string): Promise<string | undefined> {
    const h = await prisma.historicoTramitacao.findFirst({
      where:   { reservaId },
      select:  { usuarioId: true },
      orderBy: { criadoEm: 'desc' },
    })
    return h?.usuarioId
  }

  private static async _enviarTeams(
    reservaId: string,
    usuarioId: string,
    payload: TeamsNotificacaoPayload
  ): Promise<void> {
    try {
      await notificarTeams(payload)

      await prisma.logIntegracao.create({
        data: {
          servico:    'TEAMS',
          endpoint:   process.env.TEAMS_WEBHOOK_URL ?? 'TEAMS_WEBHOOK_URL',
          metodo:     'POST',
          statusHttp: 202,
          payload:    { reservaId, evento: payload.evento },
        },
      })

      await prisma.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId,
          evento:    TipoEvento.NOTIFICACAO_TEAMS,
          observacao: `Notificação de ${payload.evento} enviada ao Teams`,
        },
      })
    } catch (err) {
      const msg        = err instanceof Error ? err.message : String(err)
      const statusHttp = err instanceof TeamsWebhookError ? err.statusHttp : undefined
      const logData: Prisma.LogIntegracaoCreateInput = {
        servico:    'TEAMS',
        endpoint:   process.env.TEAMS_WEBHOOK_URL ?? 'TEAMS_WEBHOOK_URL',
        metodo:     'POST',
        statusHttp,
        payload:    { reservaId, evento: payload.evento },
        erro:       msg,
        ...(err instanceof TeamsWebhookError && err.responseBody
          ? { resposta: sanitizeForJson(err.responseBody) }
          : {}),
      }
      await prisma.logIntegracao.create({ data: logData })
      console.error(`[Teams] Falha ${payload.evento}:`, msg)
      // NÃO propaga — Teams é best-effort
    }
  }

  private static _montarDescricaoCSC(reserva: ReservaComIncludes): string {
    const diaFormatado = new Intl.DateTimeFormat('pt-BR').format(reserva.dia)
    const linha = `- ${diaFormatado} das ${reserva.horaInicio} às ${reserva.horaFim}`

    const linhas = [
      `Solicitação de Reserva de Laboratório`,
      ``,
      `Título: ${reserva.titulo}`,
      `Modalidade: ${reserva.modalidadeReserva}`,
      `Softwares utilizados: ${reserva.softwaresUtilizados}`,
      `Número de alunos: ${reserva.numeroAlunos}`,
      ``,
      `Professor: ${reserva.professor.nome}`,
      `E-mail do professor: ${reserva.professor.email}`,
      reserva.professor.telefone    ? `Telefone: ${reserva.professor.telefone}` : '',
      reserva.professor.departamento ? `Departamento: ${reserva.professor.departamento}` : '',
      ``,
      `Turma: ${reserva.turma.codigo} — ${reserva.turma.nome}`,
      `Curso: ${reserva.turma.curso}`,
      `Disciplina: ${reserva.turma.codigoDisciplina}`,
      `Semestre: ${reserva.turma.semestre}`,
      ``,
      `Data solicitada:`,
      linha,
      ``,
      `Solicitante: ${reserva.solicitante.nome} (${reserva.solicitante.email})`,
    ]

    return linhas.filter((l) => l !== null).join('\n')
  }

  private static _montarPayloadTeams(
    reserva: ReservaComIncludes,
    evento: TipoEventoTeams,
    extras: { cscProtocolo?: string; laboratorio?: string; motivoRejeicao?: string } = {}
  ): TeamsNotificacaoPayload {
    return {
      titulo:       reserva.titulo,
      reservaId:    reserva.id,
      solicitante:  reserva.solicitante.nome,
      professor:    reserva.professor.nome,
      modalidade:   reserva.modalidadeReserva as 'PRESENCIAL' | 'REMOTO' | 'RAS',
      softwares:    reserva.softwaresUtilizados,
      numeroAlunos: reserva.numeroAlunos,
      // Novo formato de datas: dia Date + horaInicio/horaFim string
      datas: [{ dia: reserva.dia, horaInicio: reserva.horaInicio, horaFim: reserva.horaFim }],
      evento,

      curso:        reserva.turma.curso,
      disciplina:   reserva.turma.nome,
      codigoDisciplina: reserva.turma.codigoDisciplina,
      semestre: reserva.turma.semestre,
      turma:  reserva.turma.codigo,
      numOferta:       reserva.turma.numOferta,
      
      ...(extras.cscProtocolo    && { cscProtocolo:    extras.cscProtocolo }),
      ...(extras.laboratorio     && { laboratorio:     extras.laboratorio }),
      ...(extras.motivoRejeicao  && { motivoRejeicao:  extras.motivoRejeicao }),
    }
  }
}