import { prisma } from '@/lib/prisma/client'
import { TipoEvento, Prisma } from '@prisma/client'
import { abrirChamadoCSC, CscApiError } from '@/lib/integrations/csc'
import {
  notificarTeams,
  TeamsWebhookError,
  TeamsNotificacaoPayload,
} from '@/lib/integrations/teams'

// Resolve configuração CSC baseada no ambiente (executada em tempo de execução)
function getCscConfig() {
  const isProducao = process.env.APP_ENV === 'producao'

  // Configurações específicas por ambiente com fallback para variáveis legadas
  return {
    apiUrl: (isProducao ? process.env.CSC_API_URL_PRODUCAO : process.env.CSC_API_URL_HOMOLOGACAO) ?? process.env.CSC_API_URL,
    token: (isProducao ? process.env.CSC_TOKEN_PRODUCAO : process.env.CSC_TOKEN_HOMOLOGACAO) ?? process.env.CSC_TOKEN,
    catalogoId: (isProducao ? process.env.CSC_CATALOGO_ID_PRODUCAO : process.env.CSC_CATALOGO_ID_HOMOLOGACAO) ?? process.env.CSC_CATALOGO_ID,
    flexFieldIec: (isProducao ? process.env.CSC_FLEX_FIELD_103_PRODUCAO : process.env.CSC_FLEX_FIELD_103_HOMOLOGACAO) ?? process.env.CSC_FLEX_FIELD_103,
    flexFieldPraca: (isProducao ? process.env.CSC_FLEX_FIELD_103_PRACA_LIBERDADE_PRODUCAO : process.env.CSC_FLEX_FIELD_103_PRACA_LIBERDADE_HOMOLOGACAO) ?? process.env.CSC_FLEX_FIELD_103_PRACA_LIBERDADE,
  } as const
}

// Helper para verificar se estamos em produção (fail-closed: qualquer valor diferente de 'producao' é não-produção)
function isProducao(): boolean {
  return process.env.APP_ENV === 'producao'
}

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
  solicitante:         Solicitante | null
  nomeSolicitanteExterno?: string | null
  emailSolicitanteExterno?: string | null
  professor:           ProfessorInfo
  turma:               TurmaInfo
}

function sanitizeForJson(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return Prisma.JsonNull as unknown as Prisma.InputJsonValue
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(sanitizeForJson) as Prisma.InputJsonValue[]
  try { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
  catch { return String(value) }
}

/**
 * Os métodos notificarConfirmacao() e notificarRejeicao() que existiam aqui
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

    let codigoPessoaOperador: string | null = null
    if (operadorId && operadorId !== 'SISTEMA') {
      const operador = await prisma.usuario.findUnique({
        where:  { id: operadorId },
        select: { id: true, codigoPessoa: true },
      })
      if (operador) codigoPessoaOperador = operador.codigoPessoa
    }

    // codigoPessoa com fallback — nunca lança exceção
    const fallbackCodigoPessoa = process.env.CSC_CODIGO_PESSOA_FALLBACK || '919880'
    const loginSolicitante = codigoPessoaOperador || fallbackCodigoPessoa
    const codigoPessoaFallbackUsado = !codigoPessoaOperador

    if (codigoPessoaFallbackUsado) {
      console.warn(`[CSC] Fallback de codigoPessoa usado para operador ${operadorId}: ${fallbackCodigoPessoa}`)
    }

    const descricaoCSC = this._montarDescricaoCSC(reserva)
    const config = getCscConfig()

    // Validar configuração CSC obrigatória
    if (!config.apiUrl || !config.token || !config.catalogoId || !config.flexFieldIec) {
      const msg = 'Variáveis de ambiente CSC não configuradas. Verifique CSC_API_URL, CSC_TOKEN, CSC_CATALOGO_ID, CSC_FLEX_FIELD_103 (e suas variantes _PRODUCAO/_HOMOLOGACAO)'
      console.error('[CSC] Configuração incompleta:', msg)
      await prisma.logIntegracao.create({
        data: {
          servico: 'CSC_IEC', endpoint: config.apiUrl ?? '', metodo: 'POST',
          payload: { Descricao: descricaoCSC.substring(0, 200), LoginSolicitante: loginSolicitante, codigoPessoaFallbackUsado },
          erro: msg,
        },
      })
      // Não bloqueia o fluxo — apenas loga
    } else {
      // Ticket A (CSC IEC) — abre para TODAS as modalidades (PRESENCIAL, REMOTO, RAS)
      let protocoloIec: string | undefined
      try {
        const resp = await abrirChamadoCSC({
          descricao: descricaoCSC,
          loginSolicitante,
          flexField103: config.flexFieldIec,
        })
        protocoloIec = resp.protocolo

        await prisma.solicitacaoReserva.update({ where: { id: reservaId }, data: { cscProtocolo: protocoloIec } })
        await prisma.historicoTramitacao.create({
          data: { reservaId, usuarioId: operadorId, evento: TipoEvento.ENVIO_CSC, metadados: { protocolo: protocoloIec, fila: 'IEC' } },
        })
        await prisma.logIntegracao.create({
                  data: {
                    servico: 'CSC_IEC', endpoint: config.apiUrl ?? '', metodo: 'POST', statusHttp: 200,
                    payload: { Descricao: descricaoCSC.substring(0, 200), LoginSolicitante: loginSolicitante, codigoPessoaFallbackUsado },
                    resposta: { protocolo: protocoloIec },
                  },
                })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await prisma.logIntegracao.create({
          data: {
            servico: 'CSC_IEC', endpoint: config.apiUrl, metodo: 'POST',
            statusHttp: err instanceof CscApiError ? err.statusHttp : undefined,
            payload: { Descricao: descricaoCSC.substring(0, 200), LoginSolicitante: loginSolicitante, codigoPessoaFallbackUsado },
            erro: msg,
            ...(err instanceof CscApiError && err.responseBody ? { resposta: sanitizeForJson(err.responseBody) } : {}),
          },
        })
        console.error('[CSC_IEC] Falha ao abrir chamado:', msg)
        // Ticket A falhou — não bloqueia nada, apenas loga
      }
    }

    // Ticket B (Praça da Liberdade) — APENAS para PRESENCIAL E produção
        if (reserva.modalidadeReserva === 'PRESENCIAL' && isProducao()) {
      if (!config.flexFieldPraca) {
        const msg = 'CSC_FLEX_FIELD_103_PRACA_LIBERDADE não configurado para este ambiente'
        console.error('[CSC_PRACA_LIBERDADE] Configuração ausente:', msg)
        await prisma.logIntegracao.create({
          data: {
            servico: 'CSC_PRACA_LIBERDADE', endpoint: config.apiUrl ?? '', metodo: 'POST',
            payload: { Descricao: descricaoCSC.substring(0, 200), LoginSolicitante: loginSolicitante, codigoPessoaFallbackUsado },
            erro: msg,
          },
        })
        return
      }

      let protocoloPracaLiberdade: string | undefined
      try {
        const resp = await abrirChamadoCSC({
          descricao: descricaoCSC,
          loginSolicitante,
          flexField103: config.flexFieldPraca,
        })
        protocoloPracaLiberdade = resp.protocolo

        await prisma.solicitacaoReserva.update({ where: { id: reservaId }, data: { cscProtocoloPracaLiberdade: protocoloPracaLiberdade } })
        await prisma.historicoTramitacao.create({
          data: { reservaId, usuarioId: operadorId, evento: TipoEvento.ENVIO_CSC, metadados: { protocolo: protocoloPracaLiberdade, fila: 'PRACA_LIBERDADE' } },
        })
        await prisma.logIntegracao.create({
                  data: {
                    servico: 'CSC_PRACA_LIBERDADE', endpoint: config.apiUrl ?? '', metodo: 'POST', statusHttp: 200,
                    payload: { Descricao: descricaoCSC.substring(0, 200), LoginSolicitante: loginSolicitante, codigoPessoaFallbackUsado },
                    resposta: { protocolo: protocoloPracaLiberdade },
                  },
                })
      } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              await prisma.logIntegracao.create({
                data: {
                  servico: 'CSC_PRACA_LIBERDADE', endpoint: config.apiUrl ?? '', metodo: 'POST',
                  statusHttp: err instanceof CscApiError ? err.statusHttp : undefined,
                  payload: { Descricao: descricaoCSC.substring(0, 200), LoginSolicitante: loginSolicitante, codigoPessoaFallbackUsado },
                  erro: msg,
                  ...(err instanceof CscApiError && err.responseBody ? { resposta: sanitizeForJson(err.responseBody) } : {}),
                },
              })
        console.error('[CSC_PRACA_LIBERDADE] Falha ao abrir chamado:', msg)
        // Ticket B falhou — NÃO envia Teams card (regra: card só com protocolo da Praça da Liberdade)
        return
      }

      // Teams card — APENAS quando Ticket B (Praça da Liberdade) SUCCEDE
      // O card carrega APENAS o protocolo da Praça da Liberdade
      await this._enviarTeams(reservaId, operadorId,
        this._montarPayloadTeams(reserva, 'CRIACAO', { cscProtocolo: protocoloPracaLiberdade! }))
    }
    // Para REMOTO/RAS: não tenta Ticket B, logo não envia Teams card
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
    }).join('\\n')

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
      `Solicitante: ${reserva.nomeSolicitanteExterno ?? reserva.solicitante?.nome ?? 'Desconhecido'} (${reserva.emailSolicitanteExterno ?? reserva.solicitante?.email ?? 'Sem email'})`,
    ].filter((l) => l !== null).join('\\n')
  }

  private static _montarPayloadTeams(
    reserva: ReservaComIncludes,
    evento: 'CRIACAO',
    extras: { cscProtocolo?: string } = {}
  ): TeamsNotificacaoPayload {
    return {
      titulo:       reserva.titulo,
      reservaId:    reserva.id,
      solicitante:  reserva.nomeSolicitanteExterno ?? reserva.solicitante?.nome ?? 'Desconhecido',
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
      numOferta: reserva.turma.numOferta ?? undefined,
      ...(extras.cscProtocolo && { cscProtocolo: extras.cscProtocolo }),
    }
  }
}
