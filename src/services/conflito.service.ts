import { prisma } from '@/lib/prisma/client'
import { GoogleCalendarService } from './google-calendar.service'

export interface HorarioDisponivel {
  horaInicio: string
  horaFim:    string
}

export interface ResultadoConflito {
  temConflito: boolean
  datasEmConflito: {
    dia:        Date
    horaInicio: string
    horaFim:    string
    reservaConflitante?: { id: string; titulo: string; status: string }
  }[]
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function fromMin(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, '0')
  const m = (min % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

export class ConflitosService {

  static async detectarConflitos(
    laboratorioId: string,
    datas: { dia: Date; horaInicio: string; horaFim: string }[],
    excluirReservaId?: string
  ): Promise<ResultadoConflito> {
    const datasEmConflito: ResultadoConflito['datasEmConflito'] = []

    for (const d of datas) {
      const conflito = await prisma.dataHorarioReserva.findFirst({
        where: {
          dia: d.dia,
          AND: [
            { horaInicio: { lt: d.horaFim } },
            { horaFim:    { gt: d.horaInicio } },
          ],
          reserva: {
            laboratorioId,
            status: { in: ['CONFIRMADA', 'AGUARDANDO_CONFIRMACAO'] },
            ...(excluirReservaId ? { id: { not: excluirReservaId } } : {}),
          },
        },
        include: { reserva: { select: { id: true, titulo: true, status: true } } },
      })

      if (conflito) {
        datasEmConflito.push({
          dia: d.dia, horaInicio: d.horaInicio, horaFim: d.horaFim,
          reservaConflitante: {
            id: conflito.reserva.id, titulo: conflito.reserva.titulo, status: conflito.reserva.status,
          },
        })
      }
    }

    return { temConflito: datasEmConflito.length > 0, datasEmConflito }
  }

  /**
   * Sugestão de horários — agora busca a ocupação na agenda ESPECÍFICA do
   * laboratório (laboratorio.googleCalendarId), além das reservas do banco.
   */
  static async sugerirHorarios(
    laboratorioId: string,
    dia: Date,
    duracaoMin = 120,
    excluirReservaId?: string
  ): Promise<HorarioDisponivel[]> {
    const datasOcupadas = await prisma.dataHorarioReserva.findMany({
      where: {
        dia,
        reserva: {
          laboratorioId,
          status: { in: ['CONFIRMADA', 'AGUARDANDO_CONFIRMACAO'] },
          ...(excluirReservaId ? { id: { not: excluirReservaId } } : {}),
        },
      },
      select: { horaInicio: true, horaFim: true },
    })

    // Busca eventos diretamente na agenda do Google Calendar deste laboratório
    const eventosCalendar = await GoogleCalendarService.buscarOcupados(laboratorioId, dia)

    const todosOcupados = [
      ...datasOcupadas.map((d) => ({ start: toMin(d.horaInicio), end: toMin(d.horaFim) })),
      ...eventosCalendar.map((e) => ({ start: toMin(e.start),    end: toMin(e.end) })),
    ].sort((a, b) => a.start - b.start)

    const INICIO_DIA = toMin('07:00')
    const FIM_DIA    = toMin('22:00')

    const sugestoes: HorarioDisponivel[] = []
    let cursor = INICIO_DIA

    for (const ocupado of todosOcupados) {
      if (ocupado.start - cursor >= duracaoMin) {
        let slotInicio = cursor
        while (slotInicio + duracaoMin <= ocupado.start) {
          sugestoes.push({ horaInicio: fromMin(slotInicio), horaFim: fromMin(slotInicio + duracaoMin) })
          slotInicio += 30
        }
      }
      cursor = Math.max(cursor, ocupado.end)
    }

    if (FIM_DIA - cursor >= duracaoMin) {
      let slotInicio = cursor
      while (slotInicio + duracaoMin <= FIM_DIA) {
        sugestoes.push({ horaInicio: fromMin(slotInicio), horaFim: fromMin(slotInicio + duracaoMin) })
        slotInicio += 30
      }
    }

    return sugestoes
  }

  static async laboratoriosDisponiveis(dia: Date, horaInicio: string, horaFim: string): Promise<string[]> {
    const todos = await prisma.laboratorio.findMany({ where: { ativo: true }, select: { id: true } })
    const disponiveis: string[] = []

    for (const lab of todos) {
      const conflito = await prisma.dataHorarioReserva.findFirst({
        where: {
          dia,
          AND: [{ horaInicio: { lt: horaFim } }, { horaFim: { gt: horaInicio } }],
          reserva: { laboratorioId: lab.id, status: { in: ['CONFIRMADA', 'AGUARDANDO_CONFIRMACAO'] } },
        },
      })
      if (!conflito) disponiveis.push(lab.id)
    }

    return disponiveis
  }
}