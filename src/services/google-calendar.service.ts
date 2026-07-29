import { prisma } from '@/lib/prisma/client'
import { TipoEvento } from '@prisma/client'
import {
  criarEvento,
  atualizarEvento,
  deletarEvento,
  buscarHorariosOcupados,
} from '@/lib/google/calendar'

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface DataHorario {
  id:           string
  dia:          Date
  horaInicio:   string
  horaFim:      string
  googleEventId: string | null
}

interface ReservaParaCalendario {
  id:                  string
  titulo:              string
  softwaresUtilizados: string
  numeroAlunos:        number
  modalidadeReserva:   string
  professor:           { nome: string; email: string }
  turma:               { nome: string; codigo: string; semestre: string; curso: string; numOferta: string | null }
  laboratorio:         { nome: string; googleCalendarId: string | null } | null
  solicitante:         { nome: string; email: string } | null
  nomeSolicitanteExterno?: string | null
  emailSolicitanteExterno?: string | null
  datas:               DataHorario[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converte enum ModalidadeReserva → label legível em português */
function modalidadeLabel(modalidade: string): string {
  const map: Record<string, string> = {
    PRESENCIAL: 'Presencial',
    REMOTO:     'Remoto',
    RAS:        'RAS',
  }
  return map[modalidade] ?? modalidade
}

/**
 * Monta o título do evento conforme o padrão institucional:
 * IEC (Modalidade) - Disciplina, oferta X, turma Y
 *
 * Exemplos:
 *   IEC (Presencial) - Redes I, oferta 10, turma turma 01
 *   IEC (Remoto) - Prog. Web, oferta 5, turma SI-2025-2
 */
function montarSummary(reserva: ReservaParaCalendario): string {
  const modalidade = modalidadeLabel(reserva.modalidadeReserva)
  const disciplina = reserva.turma.nome
  const oferta     = reserva.turma.numOferta ?? '—'
  const turma      = reserva.turma.codigo

  return `IEC (${modalidade}) - ${disciplina}, oferta ${oferta}, turma ${turma}`
}

/**
 * Monta a descrição detalhada do evento (comum a todas as datas da reserva).
 */
function montarDescription(reserva: ReservaParaCalendario): string {
  return [
    `Reserva: ${reserva.titulo}`,
    `Turma: ${reserva.turma.codigo} — ${reserva.turma.nome}`,
    `Curso: ${reserva.turma.curso} | Semestre: ${reserva.turma.semestre}`,
    `Professor: ${reserva.professor.nome}`,
    `Softwares: ${reserva.softwaresUtilizados}`,
    `Nº alunos: ${reserva.numeroAlunos}`,
    `Solicitante: ${reserva.nomeSolicitanteExterno ?? reserva.solicitante?.nome ?? 'Desconhecido'} (${reserva.emailSolicitanteExterno ?? reserva.solicitante?.email ?? 'Sem email'})`,
  ].join('\n')
}

// ─── Serviço ──────────────────────────────────────────────────────────────────

export class GoogleCalendarService {

  /**
   * Cria UM EVENTO POR DATA da reserva na agenda do laboratório confirmado.
   *
   * CORREÇÃO em relação à versão anterior:
   * - googleEventId agora vive em DataHorarioReserva (não mais em SolicitacaoReserva)
   * - Para cada DataHorarioReserva sem googleEventId, cria 1 evento no Calendar
   * - Persiste o eventId de volta em DataHorarioReserva.googleEventId
   */
  static async criarEventoReserva(reservaId: string, operadorId: string): Promise<void> {
    const reserva    = await this._carregarReserva(reservaId)
    const calendarId = reserva.laboratorio?.googleCalendarId

    if (!calendarId) {
      console.warn(`[GoogleCalendar] Laboratório "${reserva.laboratorio?.nome ?? 'não vinculado'}" sem googleCalendarId. Pulando criação de eventos.`)
      return
    }

    const summary     = montarSummary(reserva)
    const description = montarDescription(reserva)
    const attendees   = [
      { email: reserva.professor.email },
      { email: reserva.emailSolicitanteExterno ?? reserva.solicitante?.email ?? '' },
    ]

    // Processa datas que ainda não têm evento criado
    const datasParaCriar = reserva.datas.filter((d) => !d.googleEventId)
    if (datasParaCriar.length === 0) {
      console.log(`[GoogleCalendar] Todos os eventos da reserva ${reservaId} já existem. Nada a criar.`)
      return
    }

    const resultados: { dataId: string; eventId: string; htmlLink?: string }[] = []
    const erros: string[] = []

    for (const data of datasParaCriar) {
      try {
        const result = await criarEvento(calendarId, {
          summary,
          description,
          location:   reserva.laboratorio?.nome,
          dia:        data.dia,
          horaInicio: data.horaInicio,
          horaFim:    data.horaFim,
          attendees,
          colorId:    '2', // sage/verde
        })

        resultados.push({ dataId: data.id, eventId: result.eventId, htmlLink: result.htmlLink })

        // Persiste o eventId nessa data específica
        await prisma.dataHorarioReserva.update({
          where: { id: data.id },
          data:  { googleEventId: result.eventId },
        })

        console.log(`[GoogleCalendar] Evento ${result.eventId} criado para data ${data.id} (${new Intl.DateTimeFormat('pt-BR').format(data.dia)} ${data.horaInicio}–${data.horaFim})`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        erros.push(`Data ${data.id} (${new Intl.DateTimeFormat('pt-BR').format(data.dia)}): ${msg}`)
        console.error(`[GoogleCalendar] Falha ao criar evento para data ${data.id}:`, msg)
      }
    }

    // Registra histórico e log mesmo se alguns eventos falharam
    await prisma.$transaction([
      prisma.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId:  operadorId,
          evento:     TipoEvento.GOOGLE_CALENDAR_CRIADO,
          observacao: erros.length === 0
            ? `${resultados.length} evento(s) criado(s) na agenda "${reserva.laboratorio?.nome}".`
            : `${resultados.length} evento(s) criado(s), ${erros.length} falha(s): ${erros.join(' | ')}`,
          metadados:  { calendarId, eventIds: resultados.map((r) => r.eventId), erros },
        },
      }),
      prisma.logIntegracao.create({
        data: {
          servico:    'GOOGLE_CALENDAR',
          endpoint:   'events.insert',
          metodo:     'POST',
          statusHttp: erros.length === 0 ? 200 : 207, // 207 = Multi-Status (parcial)
          payload:    { reservaId, calendarId, summary, totalDatas: datasParaCriar.length },
          resposta:   { criados: resultados, falhas: erros },
          ...(erros.length > 0 ? { erro: erros.join(' | ') } : {}),
        },
      }),
    ])

    if (erros.length > 0) {
      throw new GoogleCalendarError(
        `Criação parcial: ${resultados.length} eventos criados, ${erros.length} falha(s).`
      )
    }
  }

  /**
   * Atualiza os eventos existentes de CADA DATA (ao reagendar).
   * - Se a data já tem googleEventId → atualiza o evento (updateEvent)
   * - Se não tem (nova data adicionada no reagendamento) → cria novo evento
   * - Datas removidas no reagendamento têm seus eventos deletados (tratado
   *   automaticamente pela cascade do Prisma ao deletar DataHorarioReserva)
   */
  static async atualizarEventoReserva(reservaId: string, operadorId: string): Promise<void> {
    const reserva    = await this._carregarReserva(reservaId)
    const calendarId = reserva.laboratorio?.googleCalendarId

    if (!calendarId) {
      console.warn(`[GoogleCalendar] Laboratório "${reserva.laboratorio?.nome ?? 'não vinculado'}" sem googleCalendarId. Pulando atualização.`)
      return
    }

    const summary     = montarSummary(reserva)
    const description = montarDescription(reserva)
    const attendees   = [
      { email: reserva.professor.email },
      { email: reserva.emailSolicitanteExterno ?? reserva.solicitante?.email ?? '' },
    ]

    const erros: string[] = []
    let atualizados = 0

    for (const data of reserva.datas) {
      try {
        let eventId:  string
        let htmlLink: string | undefined

        if (data.googleEventId) {
          const result = await atualizarEvento(calendarId, data.googleEventId, {
            summary, description, attendees, colorId: '2',
            location:   reserva.laboratorio?.nome,
            dia:        data.dia,
            horaInicio: data.horaInicio,
            horaFim:    data.horaFim,
          })
          eventId  = result.eventId
          htmlLink = result.htmlLink

          // Atualiza o eventId no banco caso o atualizarEvento tenha recriado (fallback 404)
          if (eventId !== data.googleEventId) {
            await prisma.dataHorarioReserva.update({
              where: { id: data.id },
              data:  { googleEventId: eventId },
            })
          }
        } else {
          // Nova data (adicionada no reagendamento) → cria evento
          const result = await criarEvento(calendarId, {
            summary, description, attendees, colorId: '2',
            location:   reserva.laboratorio?.nome,
            dia:        data.dia,
            horaInicio: data.horaInicio,
            horaFim:    data.horaFim,
          })
          eventId  = result.eventId
          htmlLink = result.htmlLink
          await prisma.dataHorarioReserva.update({
            where: { id: data.id },
            data:  { googleEventId: eventId },
          })
        }

        atualizados++
        console.log(`[GoogleCalendar] Evento ${eventId} atualizado para data ${data.id}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        erros.push(`Data ${data.id}: ${msg}`)
      }
    }

    await prisma.$transaction([
      prisma.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId:  operadorId,
          evento:     TipoEvento.GOOGLE_CALENDAR_ATUALIZADO,
          observacao: `${atualizados} evento(s) atualizados na agenda "${reserva.laboratorio?.nome}".${erros.length > 0 ? ` ${erros.length} falha(s).` : ''}`,
          metadados:  { calendarId, erros },
        },
      }),
      prisma.logIntegracao.create({
        data: {
          servico:    'GOOGLE_CALENDAR',
          endpoint:   'events.update',
          metodo:     'PUT',
          statusHttp: erros.length === 0 ? 200 : 207,
          payload:    { reservaId, calendarId, totalDatas: reserva.datas.length },
          resposta:   { atualizados, falhas: erros },
          ...(erros.length > 0 ? { erro: erros.join(' | ') } : {}),
        },
      }),
    ])

    if (erros.length > 0) {
      throw new GoogleCalendarError(`Atualização parcial: ${atualizados} ok, ${erros.length} falha(s).`)
    }
  }

  /**
   * Deleta o evento de CADA DATA da reserva (ao rejeitar/cancelar).
   * Lê googleEventId de cada DataHorarioReserva e chama deletarEvento por data.
   */
  static async deletarEventoReserva(reservaId: string, operadorId: string): Promise<void> {
    // Carrega laboratorio e datas com googleEventId diretamente de DataHorarioReserva
    // Usa findUnique (não OrThrow) pois a reserva pode já ter sido excluída ou
    // estar em estado onde não é mais acessível no momento da rejeição
    const reserva = await prisma.solicitacaoReserva.findUnique({
      where:  { id: reservaId },
      select: {
        laboratorio: { select: { nome: true, googleCalendarId: true } },
        datas:       { select: { id: true, dia: true, googleEventId: true } },
      },
    })

    if (!reserva) {
      console.log(`[GoogleCalendar] Reserva ${reservaId} não encontrada. Pulando deleção de eventos.`)
      return
    }

    const calendarId = reserva.laboratorio?.googleCalendarId
    const datasComEvento = reserva.datas.filter((d) => d.googleEventId)

    if (datasComEvento.length === 0) {
      console.log(`[GoogleCalendar] Reserva ${reservaId} não tem eventos no Calendar. Nada a deletar.`)
      return
    }

    if (!calendarId) {
      // Tem eventIds mas o lab perdeu o calendarId → limpa referências órfãs
      console.warn(`[GoogleCalendar] Lab sem googleCalendarId mas datas têm googleEventId. Limpando referências órfãs.`)
      await prisma.dataHorarioReserva.updateMany({
        where: { reservaId },
        data:  { googleEventId: null },
      })
      return
    }

    const erros: string[] = []
    let deletados = 0

    for (const data of datasComEvento) {
      try {
        await deletarEvento(calendarId, data.googleEventId!)
        await prisma.dataHorarioReserva.update({
          where: { id: data.id },
          data:  { googleEventId: null },
        })
        deletados++
        console.log(`[GoogleCalendar] Evento ${data.googleEventId} removido (data ${data.id})`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        erros.push(`Data ${data.id}: ${msg}`)
      }
    }

    // Tenta criar o histórico e log de integração, mas não falha a operação
    // se a reserva ou o usuário já não existirem (ex: exclusão concorrente)
    try {
      await prisma.$transaction([
        prisma.historicoTramitacao.create({
          data: {
            reservaId,
            usuarioId:  operadorId,
            evento:     TipoEvento.GOOGLE_CALENDAR_ATUALIZADO,
            observacao: `${deletados} evento(s) removidos da agenda "${reserva.laboratorio?.nome}" (rejeição).`,
            metadados:  { calendarId, deletados, erros },
          },
        }),
        prisma.logIntegracao.create({
          data: {
            servico:    'GOOGLE_CALENDAR',
            endpoint:   'events.delete',
            metodo:     'DELETE',
            statusHttp: erros.length === 0 ? 204 : 207,
            payload:    { reservaId, calendarId, totalDatas: datasComEvento.length },
            resposta:   { deletados, falhas: erros },
            ...(erros.length > 0 ? { erro: erros.join(' | ') } : {}),
          },
        }),
      ])
    } catch (histErr) {
      // Loga o erro mas não propaga - a deleção dos eventos já foi feita
      console.warn('[GoogleCalendar] Falha ao registrar histórico/log de deleção (pode ser reserva/usuário inexistente):', 
        histErr instanceof Error ? histErr.message : String(histErr))
    }

    if (erros.length > 0) {
      throw new GoogleCalendarError(`Deleção parcial: ${deletados} ok, ${erros.length} falha(s).`)
    }
  }

  /**
   * Busca ocupação na agenda específica de UM laboratório (usado em sugestão de horários).
   */
  static async buscarOcupados(laboratorioId: string, dia: Date): Promise<{ start: string; end: string }[]> {
    try {
      const lab = await prisma.laboratorio.findUnique({
        where:  { id: laboratorioId },
        select: { googleCalendarId: true },
      })
      if (!lab?.googleCalendarId) return []
      return await buscarHorariosOcupados(lab.googleCalendarId, dia)
    } catch (err) {
      console.warn('[GoogleCalendar] Falha ao buscar horários ocupados:', err)
      return []
    }
  }

  // ─── Helpers privados ───────────────────────────────────────────────────────

  private static async _carregarReserva(reservaId: string): Promise<ReservaParaCalendario> {
    return prisma.solicitacaoReserva.findUniqueOrThrow({
      where: { id: reservaId },
      select: {
        id:                  true,
        titulo:              true,
        softwaresUtilizados: true,
        numeroAlunos:        true,
        modalidadeReserva:   true,
        // NÃO seleciona mais googleEventId aqui — ele agora vive em cada DataHorarioReserva
        professor:   { select: { nome: true, email: true } },
        turma:       { select: { nome: true, codigo: true, semestre: true, curso: true, numOferta: true } },
        laboratorio: { select: { nome: true, googleCalendarId: true } },
        nomeSolicitanteExterno: true,
        emailSolicitanteExterno: true,
        solicitante: { select: { nome: true, email: true } },
        datas: {
          orderBy: { dia: 'asc' },
          select: {
            id:           true,
            dia:          true,
            horaInicio:   true,
            horaFim:      true,
            googleEventId: true,  // lido diretamente de DataHorarioReserva
          },
        },
      },
    })
  }
}

export class GoogleCalendarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleCalendarError'
  }
}