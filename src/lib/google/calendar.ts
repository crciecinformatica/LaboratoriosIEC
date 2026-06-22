import { google } from 'googleapis'
import { getGoogleAuthClient } from './auth'

export interface GoogleCalendarEventInput {
  summary:     string
  description: string
  location?:   string
  dia:         Date
  horaInicio:  string
  horaFim:     string
  attendees?: { email: string }[]
  colorId?: string
}

export interface GoogleCalendarEventResult {
  eventId:   string
  htmlLink?: string
}

function calendarApi() {
  return google.calendar({ version: 'v3', auth: getGoogleAuthClient() })
}

const GOOGLE_CALENDAR_TIME_ZONE = 'America/Sao_Paulo'
const GOOGLE_CALENDAR_UTC_OFFSET = '-03:00'

function formatDateInCalendarTimeZone(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: GOOGLE_CALENDAR_TIME_ZONE,
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  }).formatToParts(date)

  const year  = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day   = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Não foi possível formatar a data para o Google Calendar.')
  }

  return `${year}-${month}-${day}`
}

function buildEventBody(input: GoogleCalendarEventInput) {
  const dateStr  = formatDateInCalendarTimeZone(input.dia)
  const [sH, sM] = input.horaInicio.split(':')
  const [eH, eM] = input.horaFim.split(':')

  const timeZone  = GOOGLE_CALENDAR_TIME_ZONE
  const startDate = `${dateStr}T${sH}:${sM}:00${GOOGLE_CALENDAR_UTC_OFFSET}`
  const endDate   = `${dateStr}T${eH}:${eM}:00${GOOGLE_CALENDAR_UTC_OFFSET}`

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
 * Cria UM evento para UMA data específica (1 data = 1 evento).
 * Para reservas com múltiplas datas, chame esta função uma vez por data
 * (ver GoogleCalendarService, que orquestra a criação em lote).
 */
export async function criarEvento(
  calendarId: string,
  input: GoogleCalendarEventInput
): Promise<GoogleCalendarEventResult> {
  if (!calendarId) throw new Error('calendarId não informado — laboratório sem googleCalendarId configurado.')

  const body = buildEventBody(input)

  const { data } = await calendarApi().events.insert({
    calendarId,
    requestBody: body,
    sendNotifications: false,
  })

  if (!data.id) throw new Error('Google Calendar não retornou eventId.')

  return { eventId: data.id, htmlLink: data.htmlLink ?? undefined }
}

/**
 * Atualiza o evento de UMA data específica. 404 → recria.
 */
export async function atualizarEvento(
  calendarId: string,
  eventId:    string,
  input:      GoogleCalendarEventInput
): Promise<GoogleCalendarEventResult> {
  if (!calendarId) throw new Error('calendarId não informado — laboratório sem googleCalendarId configurado.')

  const body = buildEventBody(input)

  try {
    const { data } = await calendarApi().events.update({ calendarId, eventId, requestBody: body })
    return { eventId: data.id!, htmlLink: data.htmlLink ?? undefined }
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code
    if (status === 404) {
      console.warn(`[GoogleCalendar] Evento ${eventId} não encontrado na agenda ${calendarId} (404), recriando.`)
      return criarEvento(calendarId, input)
    }
    throw err
  }
}

/**
 * Remove o evento de UMA data específica. 404 é ignorado.
 */
export async function deletarEvento(calendarId: string, eventId: string): Promise<void> {
  if (!calendarId) throw new Error('calendarId não informado — laboratório sem googleCalendarId configurado.')

  try {
    await calendarApi().events.delete({ calendarId, eventId })
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code
    if (status === 404) {
      console.warn(`[GoogleCalendar] Evento ${eventId} já não existe na agenda ${calendarId}, ignorando.`)
      return
    }
    throw err
  }
}

/**
 * Busca horários ocupados em UMA agenda (um laboratório) para um dia específico.
 */
export async function buscarHorariosOcupados(
  calendarId: string,
  dia: Date
): Promise<{ start: string; end: string }[]> {
  if (!calendarId) return []

  const dateStr = formatDateInCalendarTimeZone(dia)
  const timeMin  = `${dateStr}T00:00:00${GOOGLE_CALENDAR_UTC_OFFSET}`
  const timeMax  = `${dateStr}T23:59:59${GOOGLE_CALENDAR_UTC_OFFSET}`

  const { data } = await calendarApi().freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: GOOGLE_CALENDAR_TIME_ZONE,
      items:    [{ id: calendarId }],
    },
  })

  const busy = data.calendars?.[calendarId]?.busy ?? []

  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({
      start: b.start!.substring(11, 16),
      end:   b.end!.substring(11, 16),
    }))
}

/**
 * Busca horários ocupados em VÁRIAS agendas de uma vez.
 */
export async function buscarHorariosOcupadosMultiplos(
  calendarIds: string[],
  dia: Date
): Promise<Record<string, { start: string; end: string }[]>> {
  const validos = calendarIds.filter(Boolean)
  if (validos.length === 0) return {}

  const dateStr = formatDateInCalendarTimeZone(dia)
  const timeMin = `${dateStr}T00:00:00${GOOGLE_CALENDAR_UTC_OFFSET}`
  const timeMax = `${dateStr}T23:59:59${GOOGLE_CALENDAR_UTC_OFFSET}`

  const { data } = await calendarApi().freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: GOOGLE_CALENDAR_TIME_ZONE,
      items:    validos.map((id) => ({ id })),
    },
  })

  const resultado: Record<string, { start: string; end: string }[]> = {}

  for (const calId of validos) {
    const busy = data.calendars?.[calId]?.busy ?? []
    resultado[calId] = busy
      .filter((b) => b.start && b.end)
      .map((b) => ({ start: b.start!.substring(11, 16), end: b.end!.substring(11, 16) }))
  }

  return resultado
}

/**
 * Lista as agendas (calendarList) disponíveis para a conta autenticada.
 */
export async function listarAgendasDisponiveis(): Promise<{ id: string; summary: string }[]> {
  const { data } = await calendarApi().calendarList.list({ maxResults: 250 })
  return (data.items ?? []).map((item) => ({
    id:      item.id ?? '',
    summary: item.summary ?? '(sem nome)',
  }))
}
