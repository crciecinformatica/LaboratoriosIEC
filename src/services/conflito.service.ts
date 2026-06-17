import { prisma } from '@/lib/prisma/client'
import { GoogleCalendarService } from './google-calendar.service'
import type { Prisma } from '@prisma/client'

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

// Cliente Prisma genérico — aceita tanto o client global quanto o `tx` de uma transação.
// CRÍTICO: ao chamar detectarConflitos() de dentro de uma transação Serializable,
// é obrigatório passar o `tx` recebido pelo callback, nunca o `prisma` global —
// caso contrário a leitura roda em outra conexão/snapshot, fora do isolamento da
// transação, e ainda compete pelo pool de conexões, podendo travar até o timeout
// padrão de 5000ms do Prisma (erro "Transaction already closed").
type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient

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

  /**
   * Detecta conflitos para um conjunto de datas.
   *
   * PERFORMANCE: antes fazia 1 query (`findFirst`) por data, em loop sequencial
   * — para reservas com várias datas, isso multiplicava o round-trip ao banco e
   * era a causa raiz do timeout de transação. Agora faz UMA única query
   * (`findMany`) buscando todas as `DataHorarioReserva` do laboratório que
   * colidem com QUALQUER uma das datas pedidas, e cruza o resultado em memória.
   *
   * @param db  Client Prisma a usar — passe o `tx` quando chamado de dentro de
   *            uma transação (ex: confirmar reserva); omita para usar o client
   *            global (ex: chamadas fora de transação, como em sugerirHorarios).
   */
  static async detectarConflitos(
    laboratorioId: string,
    datas: { dia: Date; horaInicio: string; horaFim: string }[],
    excluirReservaId?: string,
    db: PrismaClientOrTx = prisma
  ): Promise<ResultadoConflito> {
    if (datas.length === 0) return { temConflito: false, datasEmConflito: [] }

    const dias = datas.map((d) => d.dia)

    // Uma única query: todas as DataHorarioReserva do laboratório, nesses dias,
    // com status relevante. A sobreposição de horário é filtrada em memória
    // (evita N queries com OR complexo, e evita problemas de comparação de
    // string de horário dentro do SQL).
    const candidatos = await db.dataHorarioReserva.findMany({
      where: {
        dia: { in: dias },
        reserva: {
          laboratorioId,
          status: { in: ['CONFIRMADA', 'AGUARDANDO_CONFIRMACAO'] },
          ...(excluirReservaId ? { id: { not: excluirReservaId } } : {}),
        },
      },
      select: {
        dia: true,
        horaInicio: true,
        horaFim: true,
        reserva: { select: { id: true, titulo: true, status: true } },
      },
    })

    const datasEmConflito: ResultadoConflito['datasEmConflito'] = []

    for (const d of datas) {
      const conflito = candidatos.find((c) =>
        c.dia.getTime() === d.dia.getTime() &&
        toMin(c.horaInicio) < toMin(d.horaFim) &&
        toMin(c.horaFim)    > toMin(d.horaInicio)
      )

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
   * Sugestão de horários — chamado fora de transação, usa o client global.
   * Sem alteração de lógica, apenas mantido aqui por completude do arquivo.
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

    // Busca eventos diretamente na agenda do Google Calendar deste laboratório.
    // Atenção: chamada de rede externa — nunca rodar isso dentro de uma
    // transação Serializable (o timeout de 5s do Prisma não tolera latência
    // de API externa). Esta função só é chamada fora de transação.
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

    // Uma única query para todos os labs, em vez de 1 findFirst por laboratório
    const ocupados = await prisma.dataHorarioReserva.findMany({
      where: {
        dia,
        AND: [{ horaInicio: { lt: horaFim } }, { horaFim: { gt: horaInicio } }],
        reserva: {
          laboratorioId: { in: todos.map((l) => l.id) },
          status: { in: ['CONFIRMADA', 'AGUARDANDO_CONFIRMACAO'] },
        },
      },
      select: { reserva: { select: { laboratorioId: true } } },
    })

    const idsOcupados = new Set(ocupados.map((o) => o.reserva.laboratorioId).filter(Boolean))

    return todos.map((l) => l.id).filter((id) => !idsOcupados.has(id))
  }
}