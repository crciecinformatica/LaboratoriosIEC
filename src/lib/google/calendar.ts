import { google } from 'googleapis'
import { getGoogleAuthClient } from './auth'

export interface GoogleCalendarEventInput {
  summary:     string           // título do evento
  description: string           // descrição com dados da reserva
  location?:   string           // nome do laboratório
  datas: {
    dia:        Date             // Date com hora zerada UTC
    horaInicio: string           // "HH:MM"
    horaFim:    string           // "HH:MM"
  }[]
  attendees?: { email: string }[]
  colorId?: string               // 1-11; 3=grape, 2=sage, 11=tomato
}

export interface GoogleCalendarEventResult {
  eventId:   string
  htmlLink?: string
}

function calendarApi() {
  return google.calendar({ version: 'v3', auth: getGoogleAuthClient() })
}

function calendarId() {
  const id = process.env.GOOGLE_CALENDAR_ID
  if (!id) throw new Error('GOOGLE_CALENDAR_ID não configurado.')
  return id
}

/**
 * Constrói o body de um evento Google Calendar a partir das datas da reserva.
 * Para reservas com múltiplas datas, cria apenas o primeiro evento.
 * Para múltiplas datas, use createEvents() que cria N eventos.
 */
function buildEventBody(input: GoogleCalendarEventInput, data: GoogleCalendarEventInput['datas'][0]) {
  const dateStr = data.dia.toISOString().split('T')[0]   // "YYYY-MM-DD"
  const [sH, sM] = data.horaInicio.split(':')
  const [eH, eM] = data.horaFim.split(':')

  // Monta datetime local no fuso padrão do calendário.
  // Usamos America/Sao_Paulo como padrão institucional.
  const timeZone  = 'America/Sao_Paulo'
  const startDate = `${dateStr}T${sH}:${sM}:00`
  const endDate   = `${dateStr}T${eH}:${eM}:00`

  return {
    summary:     input.summary,
    description: input.description,
    location:    input.location,
    colorId:     input.colorId,
    start: { dateTime: startDate, timeZone },
    end:   { dateTime: endDate,   timeZone },
    attendees: input.attendees,
    reminders: {
      useDefault: false,
      overrides:  [{ method: 'email', minutes: 60 * 24 }],
    },
  }
}

/**
 * Cria um único evento no Google Calendar (para reservas com 1 data ou a primeira data).
 * Retorna o eventId para ser salvo em SolicitacaoReserva.googleEventId.
 */
export async function criarEvento(input: GoogleCalendarEventInput): Promise<GoogleCalendarEventResult> {
  if (input.datas.length === 0) throw new Error('Nenhuma data fornecida para criar evento.')

  const body = buildEventBody(input, input.datas[0])

  // Para múltiplas datas, adiciona todas no campo description como lista
  if (input.datas.length > 1) {
    const listaDatas = input.datas.map((d) => {
      const dia = new Intl.DateTimeFormat('pt-BR').format(d.dia)
      return `• ${dia} ${d.horaInicio}–${d.horaFim}`
    }).join('\n')
    body.description = `${body.description}\n\nDatas adicionais:\n${listaDatas}`
  }

  const { data } = await calendarApi().events.insert({
    calendarId: calendarId(),
    requestBody: body,
    sendNotifications: false,
  })

  if (!data.id) throw new Error('Google Calendar não retornou eventId.')

  return { eventId: data.id, htmlLink: data.htmlLink ?? undefined }
}

/**
 * Atualiza um evento existente (usado no reagendamento).
 * Se o eventId não for encontrado no Google (404), faz fallback para criação.
 */
export async function atualizarEvento(
  eventId: string,
  input: GoogleCalendarEventInput
): Promise<GoogleCalendarEventResult> {
  if (input.datas.length === 0) throw new Error('Nenhuma data fornecida para atualizar evento.')

  const body = buildEventBody(input, input.datas[0])

  if (input.datas.length > 1) {
    const listaDatas = input.datas.map((d) => {
      const dia = new Intl.DateTimeFormat('pt-BR').format(d.dia)
      return `• ${dia} ${d.horaInicio}–${d.horaFim}`
    }).join('\n')
    body.description = `${body.description}\n\nDatas adicionais:\n${listaDatas}`
  }

  try {
    const { data } = await calendarApi().events.update({
      calendarId:  calendarId(),
      eventId,
      requestBody: body,
    })
    return { eventId: data.id!, htmlLink: data.htmlLink ?? undefined }
  } catch (err: unknown) {
    // 404 → evento foi deletado manualmente no Calendar; recria
    const status = (err as { code?: number })?.code
    if (status === 404) {
      console.warn(`[GoogleCalendar] Evento ${eventId} não encontrado (404), recriando.`)
      return criarEvento(input)
    }
    throw err
  }
}

/**
 * Remove um evento do Google Calendar.
 * Erros 404 (já deletado) são ignorados silenciosamente.
 */
export async function deletarEvento(eventId: string): Promise<void> {
  try {
    await calendarApi().events.delete({
      calendarId: calendarId(),
      eventId,
    })
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code
    if (status === 404) {
      console.warn(`[GoogleCalendar] Evento ${eventId} já não existe, ignorando.`)
      return
    }
    throw err
  }
}

/**
 * Busca os horários ocupados do calendário em uma data específica.
 * Retorna array de intervalos [{ start, end }] com hora local.
 */
export async function buscarHorariosOcupados(
  dia: Date
): Promise<{ start: string; end: string }[]> {
  const dateStr   = dia.toISOString().split('T')[0]
  const timeMin   = `${dateStr}T00:00:00-03:00`
  const timeMax   = `${dateStr}T23:59:59-03:00`

  const { data } = await calendarApi().freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: 'America/Sao_Paulo',
      items:    [{ id: calendarId() }],
    },
  })

  const busy = data.calendars?.[calendarId()]?.busy ?? []

  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({
      start: b.start!.substring(11, 16), // extrai "HH:MM" do ISO
      end:   b.end!.substring(11, 16),
    }))
}