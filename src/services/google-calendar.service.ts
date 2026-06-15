import { prisma } from '@/lib/prisma/client'
import { TipoEvento } from '@prisma/client'
import {
  criarEvento,
  atualizarEvento,
  deletarEvento,
  buscarHorariosOcupados,
  type GoogleCalendarEventInput,
} from '@/lib/google/calendar'

// Tipo interno: os dados da reserva necessários para montar o evento
interface ReservaParaCalendario {
  id:                  string
  titulo:              string
  softwaresUtilizados: string
  numeroAlunos:        number
  googleEventId?:      string | null
  professor:           { nome: string; email: string }
  turma:               { nome: string; codigo: string; semestre: string; curso: string }
  laboratorio?:        { nome: string } | null
  solicitante:         { nome: string; email: string }
  datas:               { dia: Date; horaInicio: string; horaFim: string }[]
}

export class GoogleCalendarService {

  /**
   * Fase 2 — Chamado após confirmar reserva.
   * Cria evento no Google Calendar e persiste googleEventId + histórico.
   */
  static async criarEventoReserva(reservaId: string, operadorId: string): Promise<void> {
    const reserva = await this._carregarReserva(reservaId)

    const input = this._montarInput(reserva)

    try {
      const { eventId, htmlLink } = await criarEvento(input)

      // Persiste o eventId na reserva e registra histórico — dentro de uma tx
      await prisma.$transaction([
        prisma.solicitacaoReserva.update({
          where: { id: reservaId },
          data:  { googleEventId: eventId },
        }),
        prisma.historicoTramitacao.create({
          data: {
            reservaId,
            usuarioId:   operadorId,
            evento:      TipoEvento.GOOGLE_CALENDAR_CRIADO,
            observacao:  `Evento criado no Google Calendar. Link: ${htmlLink ?? eventId}`,
            metadados:   { eventId, htmlLink },
          },
        }),
        prisma.logIntegracao.create({
          data: {
            servico:   'GOOGLE_CALENDAR',
            endpoint:  'events.insert',
            metodo:    'POST',
            statusHttp: 200,
            payload:   { reservaId, summary: input.summary },
            resposta:  { eventId, htmlLink },
          },
        }),
      ])

      console.log(`[GoogleCalendar] Evento criado: ${eventId} para reserva ${reservaId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.logIntegracao.create({
        data: {
          servico:  'GOOGLE_CALENDAR',
          endpoint: 'events.insert',
          metodo:   'POST',
          payload:  { reservaId },
          erro:     msg,
        },
      })
      // Lança para a rota tratar — falha no Calendar NÃO deve reverter a confirmação
      throw new GoogleCalendarError(`Falha ao criar evento no Google Calendar: ${msg}`)
    }
  }

  /**
   * Fase 3 — Chamado após reagendar reserva.
   * Atualiza evento existente (ou cria se não existir).
   */
  static async atualizarEventoReserva(reservaId: string, operadorId: string): Promise<void> {
    const reserva = await this._carregarReserva(reservaId)
    const input   = this._montarInput(reserva)

    try {
      let eventId:  string
      let htmlLink: string | undefined

      if (reserva.googleEventId) {
        const result = await atualizarEvento(reserva.googleEventId, input)
        eventId  = result.eventId
        htmlLink = result.htmlLink
      } else {
        // Não tinha evento ainda (confirmada sem Calendar na sprint anterior) → cria
        const result = await criarEvento(input)
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
            usuarioId:   operadorId,
            evento:      TipoEvento.GOOGLE_CALENDAR_ATUALIZADO,
            observacao:  `Evento atualizado no Google Calendar. EventId: ${eventId}`,
            metadados:   { eventId, htmlLink },
          },
        }),
        prisma.logIntegracao.create({
          data: {
            servico:   'GOOGLE_CALENDAR',
            endpoint:  'events.update',
            metodo:    'PUT',
            statusHttp: 200,
            payload:   { reservaId, eventId },
            resposta:  { htmlLink },
          },
        }),
      ])

      console.log(`[GoogleCalendar] Evento atualizado: ${eventId} para reserva ${reservaId}`)
    } catch (err) {
      if (err instanceof GoogleCalendarError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.logIntegracao.create({
        data: {
          servico:  'GOOGLE_CALENDAR',
          endpoint: 'events.update',
          metodo:   'PUT',
          payload:  { reservaId },
          erro:     msg,
        },
      })
      throw new GoogleCalendarError(`Falha ao atualizar evento no Google Calendar: ${msg}`)
    }
  }

  /**
   * Fase 4 — Chamado após rejeitar reserva.
   * Remove o evento do Google Calendar se existir.
   */
  static async deletarEventoReserva(reservaId: string, operadorId: string): Promise<void> {
    const reserva = await prisma.solicitacaoReserva.findUniqueOrThrow({
      where:  { id: reservaId },
      select: { googleEventId: true },
    })

    if (!reserva.googleEventId) {
      console.log(`[GoogleCalendar] Reserva ${reservaId} não tem evento. Nada a deletar.`)
      return
    }

    try {
      await deletarEvento(reserva.googleEventId)

      await prisma.$transaction([
        prisma.solicitacaoReserva.update({
          where: { id: reservaId },
          data:  { googleEventId: null },
        }),
        prisma.historicoTramitacao.create({
          data: {
            reservaId,
            usuarioId:   operadorId,
            evento:      TipoEvento.GOOGLE_CALENDAR_ATUALIZADO,
            observacao:  `Evento removido do Google Calendar (rejeição). EventId: ${reserva.googleEventId}`,
            metadados:   { eventId: reserva.googleEventId, acao: 'DELETE' },
          },
        }),
        prisma.logIntegracao.create({
          data: {
            servico:   'GOOGLE_CALENDAR',
            endpoint:  'events.delete',
            metodo:    'DELETE',
            statusHttp: 204,
            payload:   { reservaId, eventId: reserva.googleEventId },
          },
        }),
      ])

      console.log(`[GoogleCalendar] Evento ${reserva.googleEventId} removido da reserva ${reservaId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.logIntegracao.create({
        data: {
          servico:  'GOOGLE_CALENDAR',
          endpoint: 'events.delete',
          metodo:   'DELETE',
          payload:  { reservaId, eventId: reserva.googleEventId },
          erro:     msg,
        },
      })
      throw new GoogleCalendarError(`Falha ao remover evento do Google Calendar: ${msg}`)
    }
  }

  /**
   * Fase 6 — Busca horários ocupados no Google Calendar para um dia específico.
   * Complementa a busca no banco com eventos externos criados diretamente no Calendar.
   */
  static async buscarOcupados(dia: Date): Promise<{ start: string; end: string }[]> {
    try {
      return await buscarHorariosOcupados(dia)
    } catch (err) {
      console.warn('[GoogleCalendar] Falha ao buscar horários ocupados:', err)
      return [] // degradação graciosa — não bloqueia o fluxo
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
        professor:           { select: { nome: true, email: true } },
        turma:               { select: { nome: true, codigo: true, semestre: true, curso: true } },
        laboratorio:         { select: { nome: true } },
        solicitante:         { select: { nome: true, email: true } },
        datas:               { orderBy: { dia: 'asc' } },
      },
    })
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
      summary:     `[Lab] ${reserva.titulo} — ${reserva.turma.codigo}`,
      description,
      location:    reserva.laboratorio?.nome,
      datas:       reserva.datas,
      attendees:   [
        { email: reserva.professor.email },
        { email: reserva.solicitante.email },
      ],
      colorId: '2', // sage/verde para reservas confirmadas
    }
  }
}

export class GoogleCalendarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleCalendarError'
  }
}