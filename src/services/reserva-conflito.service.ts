import { prisma } from '@/lib/prisma/client'
import { GoogleCalendarService } from './google-calendar.service'

export interface HorarioDisponivel {
  horaInicio: string  // "HH:MM"
  horaFim:    string  // "HH:MM"
}

export interface ResultadoConflito {
  temConflito: boolean
  datasEmConflito: {
    dia:        Date
    horaInicio: string
    horaFim:    string
    reservaConflitante?: {
      id:    string
      titulo: string
      status: string
    }
  }[]
}

/**
 * Converte "HH:MM" → minutos desde 00:00
 */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Converte minutos → "HH:MM"
 */
function fromMin(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, '0')
  const m = (min % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Verifica sobreposição entre dois intervalos de horário.
 * Critério: A começa antes de B terminar E A termina depois de B começar.
 */
function sobrepoe(
  aInicio: string, aFim: string,
  bInicio: string, bFim: string
): boolean {
  return toMin(aInicio) < toMin(bFim) && toMin(aFim) > toMin(bInicio)
}

export class ConflitosService {

  /**
   * Fase 5 — Detecção avançada de conflito.
   * Verifica cada data contra reservas CONFIRMADAS e AGUARDANDO_CONFIRMACAO do laboratório.
   * Retorna detalhes de CADA data em conflito (não apenas boolean).
   */
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
          // sobreposição de horário
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
        include: {
          reserva: { select: { id: true, titulo: true, status: true } },
        },
      })

      if (conflito) {
        datasEmConflito.push({
          dia:        d.dia,
          horaInicio: d.horaInicio,
          horaFim:    d.horaFim,
          reservaConflitante: {
            id:    conflito.reserva.id,
            titulo: conflito.reserva.titulo,
            status: conflito.reserva.status,
          },
        })
      }
    }

    return {
      temConflito:     datasEmConflito.length > 0,
      datasEmConflito,
    }
  }

  /**
   * Fase 6 — Sugestão inteligente de horários.
   *
   * Busca os intervalos ocupados no laboratório (Prisma) + Google Calendar (freebusy)
   * para um dia, e retorna os "buracos" livres com a duração solicitada.
   *
   * @param laboratorioId  ID do laboratório
   * @param dia            Data para buscar (Date com hora zerada UTC)
   * @param duracaoMin     Duração desejada em minutos (default 120 = 2h)
   * @param excluirReservaId  Reserva a ignorar no cálculo (útil ao reagendar)
   * @returns Array de horários disponíveis no formato "HH:MM"
   */
  static async sugerirHorarios(
    laboratorioId: string,
    dia: Date,
    duracaoMin     = 120,
    excluirReservaId?: string
  ): Promise<HorarioDisponivel[]> {
    // 1. Busca reservas confirmadas no banco para o dia
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

    // 2. Busca eventos diretamente no Google Calendar (eventos externos ao sistema)
    const eventosCalendar = await GoogleCalendarService.buscarOcupados(dia)

    // 3. Mescla e ordena todos os intervalos ocupados
    const todosOcupados = [
      ...datasOcupadas.map((d) => ({ start: toMin(d.horaInicio), end: toMin(d.horaFim) })),
      ...eventosCalendar.map((e) => ({ start: toMin(e.start),    end: toMin(e.end) })),
    ].sort((a, b) => a.start - b.start)

    // 4. Define a janela de operação do laboratório: 07:00 às 22:00
    const INICIO_DIA = toMin('07:00')
    const FIM_DIA    = toMin('22:00')

    // 5. Encontra os "buracos" (slots livres com duração suficiente)
    const sugestoes: HorarioDisponivel[] = []
    let cursor = INICIO_DIA

    for (const ocupado of todosOcupados) {
      // Há espaço livre entre cursor e o início do próximo evento?
      if (ocupado.start - cursor >= duracaoMin) {
        // Gera sugestões a cada 30 min dentro do buraco
        let slotInicio = cursor
        while (slotInicio + duracaoMin <= ocupado.start) {
          sugestoes.push({
            horaInicio: fromMin(slotInicio),
            horaFim:    fromMin(slotInicio + duracaoMin),
          })
          slotInicio += 30
        }
      }
      // Avança cursor para depois deste evento
      cursor = Math.max(cursor, ocupado.end)
    }

    // Verifica se há espaço livre após o último evento
    if (FIM_DIA - cursor >= duracaoMin) {
      let slotInicio = cursor
      while (slotInicio + duracaoMin <= FIM_DIA) {
        sugestoes.push({
          horaInicio: fromMin(slotInicio),
          horaFim:    fromMin(slotInicio + duracaoMin),
        })
        slotInicio += 30
      }
    }

    return sugestoes
  }

  /**
   * Retorna os laboratórios disponíveis para uma data/horário específicos.
   * Útil para a UI mostrar "qual lab está livre nesse horário".
   */
  static async laboratoriosDisponiveis(
    dia: Date,
    horaInicio: string,
    horaFim: string
  ): Promise<string[]> {
    const todos = await prisma.laboratorio.findMany({
      where:  { ativo: true },
      select: { id: true },
    })

    const disponiveis: string[] = []

    for (const lab of todos) {
      const conflito = await prisma.dataHorarioReserva.findFirst({
        where: {
          dia,
          AND: [
            { horaInicio: { lt: horaFim } },
            { horaFim:    { gt: horaInicio } },
          ],
          reserva: {
            laboratorioId: lab.id,
            status: { in: ['CONFIRMADA', 'AGUARDANDO_CONFIRMACAO'] },
          },
        },
      })
      if (!conflito) disponiveis.push(lab.id)
    }

    return disponiveis
  }
}