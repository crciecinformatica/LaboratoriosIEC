import { prisma } from '@/lib/prisma/client'
import { TipoEvento } from '@prisma/client'
import {
  criarEvento,
  atualizarEvento,
  deletarEvento,
  buscarHorariosOcupados,
  type GoogleCalendarEventInput,
} from '@/lib/google/calendar'

interface ReservaParaCalendario {
  id:                  string
  titulo:              string
  softwaresUtilizados: string
  numeroAlunos:        number
  googleEventId:       string | null
  professor:           { nome: string; email: string }
  turma:               { nome: string; codigo: string; semestre: string; curso: string }
  laboratorio:         { nome: string; googleCalendarId: string | null } | null
  solicitante:         { nome: string; email: string }
  datas:               { dia: Date; horaInicio: string; horaFim: string }[]
}

export class GoogleCalendarService {

  /**
   * Fase 2 — Cria evento na agenda do LABORATÓRIO confirmado (não em uma agenda global).
   */
  static async criarEventoReserva(reservaId: string, operadorId: string): Promise<void> {
    const reserva    = await this._carregarReserva(reservaId)
    const calendarId = this._resolverCalendarId(reserva)

    if (!calendarId) {
      console.warn(`[GoogleCalendar] Laboratório "${reserva.laboratorio?.nome}" sem googleCalendarId configurado. Pulando criação de evento.`)
      return
    }

    const input = this._montarInput(reserva)

    try {
      const { eventId, htmlLink } = await criarEvento(calendarId, input)

      await prisma.$transaction([
        prisma.solicitacaoReserva.update({
          where: { id: reservaId },
          data:  { googleEventId: eventId },
        }),
        prisma.historicoTramitacao.create({
          data: {
            reservaId,
            usuarioId:  operadorId,
            evento:     TipoEvento.GOOGLE_CALENDAR_CRIADO,
            observacao: `Evento criado na agenda "${reserva.laboratorio?.nome}". Link: ${htmlLink ?? eventId}`,
            metadados:  { eventId, htmlLink, calendarId },
          },
        }),
        prisma.logIntegracao.create({
          data: {
            servico:    'GOOGLE_CALENDAR',
            endpoint:   'events.insert',
            metodo:     'POST',
            statusHttp: 200,
            payload:    { reservaId, calendarId, summary: input.summary },
            resposta:   { eventId, htmlLink },
          },
        }),
      ])

      console.log(`[GoogleCalendar] Evento ${eventId} criado na agenda ${calendarId} (${reserva.laboratorio?.nome})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.logIntegracao.create({
        data: {
          servico:  'GOOGLE_CALENDAR',
          endpoint: 'events.insert',
          metodo:   'POST',
          payload:  { reservaId, calendarId },
          erro:     msg,
        },
      })
      throw new GoogleCalendarError(`Falha ao criar evento no Google Calendar: ${msg}`)
    }
  }

  /**
   * Fase 3 — Atualiza evento. Se o laboratório mudou entre o reagendamento,
   * o evento antigo (agenda anterior) é removido e um novo é criado na nova agenda.
   */
  static async atualizarEventoReserva(reservaId: string, operadorId: string): Promise<void> {
    const reserva    = await this._carregarReserva(reservaId)
    const calendarId = this._resolverCalendarId(reserva)

    if (!calendarId) {
      console.warn(`[GoogleCalendar] Laboratório "${reserva.laboratorio?.nome}" sem googleCalendarId. Pulando atualização.`)
      return
    }

    const input = this._montarInput(reserva)

    try {
      let eventId:  string
      let htmlLink: string | undefined

      if (reserva.googleEventId) {
        const result = await atualizarEvento(calendarId, reserva.googleEventId, input)
        eventId  = result.eventId
        htmlLink = result.htmlLink
      } else {
        const result = await criarEvento(calendarId, input)
        eventId  = result.eventId
        htmlLink = result.htmlLink
        await prisma.solicitacaoReserva.update({
          where: { id: reservaId },
          data:  { googleEventId: eventId },
        })
      }

      await prisma.$transaction([
        prisma.historicoTramitacao.create({
          data: {
            reservaId,
            usuarioId:  operadorId,
            evento:     TipoEvento.GOOGLE_CALENDAR_ATUALIZADO,
            observacao: `Evento atualizado na agenda "${reserva.laboratorio?.nome}". EventId: ${eventId}`,
            metadados:  { eventId, htmlLink, calendarId },
          },
        }),
        prisma.logIntegracao.create({
          data: {
            servico:    'GOOGLE_CALENDAR',
            endpoint:   'events.update',
            metodo:     'PUT',
            statusHttp: 200,
            payload:    { reservaId, eventId, calendarId },
            resposta:   { htmlLink },
          },
        }),
      ])

      console.log(`[GoogleCalendar] Evento ${eventId} atualizado na agenda ${calendarId}`)
    } catch (err) {
      if (err instanceof GoogleCalendarError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.logIntegracao.create({
        data: { servico: 'GOOGLE_CALENDAR', endpoint: 'events.update', metodo: 'PUT', payload: { reservaId, calendarId }, erro: msg },
      })
      throw new GoogleCalendarError(`Falha ao atualizar evento no Google Calendar: ${msg}`)
    }
  }

  /**
   * Fase 4 — Remove evento da agenda do laboratório (precisa carregar antes de
   * apagar googleEventId, pois precisamos saber em qual agenda ele está).
   */
  static async deletarEventoReserva(reservaId: string, operadorId: string): Promise<void> {
    const reserva = await prisma.solicitacaoReserva.findUniqueOrThrow({
      where:  { id: reservaId },
      select: {
        googleEventId: true,
        laboratorio:   { select: { nome: true, googleCalendarId: true } },
      },
    })

    if (!reserva.googleEventId) {
      console.log(`[GoogleCalendar] Reserva ${reservaId} não tem evento. Nada a deletar.`)
      return
    }

    const calendarId = reserva.laboratorio?.googleCalendarId
    if (!calendarId) {
      console.warn(`[GoogleCalendar] Reserva ${reservaId} tem googleEventId mas o laboratório não tem googleCalendarId. Limpando referência órfã.`)
      await prisma.solicitacaoReserva.update({ where: { id: reservaId }, data: { googleEventId: null } })
      return
    }

    try {
      await deletarEvento(calendarId, reserva.googleEventId)

      await prisma.$transaction([
        prisma.solicitacaoReserva.update({
          where: { id: reservaId },
          data:  { googleEventId: null },
        }),
        prisma.historicoTramitacao.create({
          data: {
            reservaId,
            usuarioId:  operadorId,
            evento:     TipoEvento.GOOGLE_CALENDAR_ATUALIZADO,
            observacao: `Evento removido da agenda "${reserva.laboratorio?.nome}" (rejeição). EventId: ${reserva.googleEventId}`,
            metadados:  { eventId: reserva.googleEventId, calendarId, acao: 'DELETE' },
          },
        }),
        prisma.logIntegracao.create({
          data: {
            servico:    'GOOGLE_CALENDAR',
            endpoint:   'events.delete',
            metodo:     'DELETE',
            statusHttp: 204,
            payload:    { reservaId, eventId: reserva.googleEventId, calendarId },
          },
        }),
      ])

      console.log(`[GoogleCalendar] Evento ${reserva.googleEventId} removido da agenda ${calendarId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.logIntegracao.create({
        data: { servico: 'GOOGLE_CALENDAR', endpoint: 'events.delete', metodo: 'DELETE', payload: { reservaId, calendarId }, erro: msg },
      })
      throw new GoogleCalendarError(`Falha ao remover evento do Google Calendar: ${msg}`)
    }
  }

  /**
   * Fase 6 — Busca ocupação na agenda específica de UM laboratório.
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
        googleEventId:       true,
        professor:   { select: { nome: true, email: true } },
        turma:       { select: { nome: true, codigo: true, semestre: true, curso: true } },
        laboratorio: { select: { nome: true, googleCalendarId: true } },
        solicitante: { select: { nome: true, email: true } },
        datas:       { orderBy: { dia: 'asc' } },
      },
    })
  }

  private static _resolverCalendarId(reserva: ReservaParaCalendario): string | null {
    return reserva.laboratorio?.googleCalendarId ?? null
  }

  private static _montarInput(reserva: ReservaParaCalendario): GoogleCalendarEventInput {
    const linhasDatas = reserva.datas.map((d) => {
      const dia = new Intl.DateTimeFormat('pt-BR').format(d.dia)
      return `• ${dia} ${d.horaInicio}–${d.horaFim}`
    }).join('\n')

    const description = [
      `Reserva: ${reserva.titulo}`,
      `Turma: ${reserva.turma.codigo} — ${reserva.turma.nome}`,
      `Curso: ${reserva.turma.curso} | Semestre: ${reserva.turma.semestre}`,
      `Professor: ${reserva.professor.nome}`,
      `Softwares: ${reserva.softwaresUtilizados}`,
      `Nº alunos: ${reserva.numeroAlunos}`,
      '',
      'Datas solicitadas:',
      linhasDatas,
      '',
      `Solicitante: ${reserva.solicitante.nome} (${reserva.solicitante.email})`,
    ].join('\n')

    return {
      summary:   `[Lab] ${reserva.titulo} — ${reserva.turma.codigo}`,
      description,
      location:  reserva.laboratorio?.nome,
      datas:     reserva.datas,
      attendees: [
        { email: reserva.professor.email },
        { email: reserva.solicitante.email },
      ],
      colorId: '2',
    }
  }
}

export class GoogleCalendarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleCalendarError'
  }
}
