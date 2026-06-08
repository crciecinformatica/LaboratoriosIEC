'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, addWeeks, subWeeks, startOfWeek, eachDayOfInterval, endOfWeek, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useCalendarioLaboratorios } from '@/hooks/useApi'
import { PageHeader } from '@/components/ui/page-header'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { statusLabel } from '@/types'
import type { StatusReserva } from '@prisma/client'

const SLOTS = Array.from({ length: 32 }, (_, i) => {
  const totalMin = 7 * 60 + i * 30
  return { hora: Math.floor(totalMin / 60), minuto: totalMin % 60 }
})

function slotLabel(hora: number, minuto: number) {
  return `${hora}:${minuto.toString().padStart(2, '0')}`
}

function eventoNoSlot(dataInicio: string, dataFim: string, dia: Date, hora: number, minuto: number) {
  const slotInicio = new Date(dia)
  slotInicio.setHours(hora, minuto, 0, 0)
  const slotFim = new Date(slotInicio.getTime() + 30 * 60 * 1000)
  const evInicio = new Date(dataInicio)
  const evFim = new Date(dataFim)
  return isSameDay(evInicio, dia) && evInicio < slotFim && evFim > slotInicio
}

export default function CalendarioPage() {
  const [semanaRef, setSemanaRef] = useState(new Date())
  const [labId, setLabId] = useState('')

  const semanaISO = semanaRef.toISOString()
  const { data, isLoading } = useCalendarioLaboratorios(labId, semanaISO)

  const inicio = startOfWeek(semanaRef, { weekStartsOn: 1 })
  const fim = endOfWeek(semanaRef, { weekStartsOn: 1 })
  const dias = eachDayOfInterval({ start: inicio, end: fim })

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <PageHeader
        title="Calendário de laboratórios"
        subtitle="Visualize as reservas confirmadas e pendentes por laboratório."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button className="btn-ghost btn-sm p-1.5" onClick={() => setSemanaRef(subWeeks(semanaRef, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[180px] text-center">
            {format(inicio, "d MMM", { locale: ptBR })} — {format(fim, "d MMM yyyy", { locale: ptBR })}
          </span>
          <button className="btn-ghost btn-sm p-1.5" onClick={() => setSemanaRef(addWeeks(semanaRef, 1))}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <select className="input max-w-xs" value={labId} onChange={(e) => setLabId(e.target.value)}>
          <option value="">Todos os laboratórios</option>
          {data?.laboratorios.map((l) => (
            <option key={l.id} value={l.id}>{l.nome}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] min-w-[700px]">
            <div className="border-b border-r border-slate-100 p-2" />
            {dias.map((dia) => (
              <div key={dia.toISOString()} className="border-b border-r border-slate-100 p-2 text-center">
                <p className="text-xs font-medium text-slate-700">{format(dia, 'EEE', { locale: ptBR })}</p>
                <p className="text-[10px] text-slate-400">{format(dia, 'dd/MM')}</p>
              </div>
            ))}
            {SLOTS.map(({ hora, minuto }) => (
              <div key={`row-${hora}-${minuto}`} className="contents">
                <div className="border-b border-r border-slate-50 p-1 text-[10px] text-slate-400 text-right pr-2">
                  {minuto === 0 ? slotLabel(hora, minuto) : ''}
                </div>
                {dias.map((dia) => {
                  const eventos = (data?.eventos ?? []).filter((e) =>
                    eventoNoSlot(e.dataInicio, e.dataFim, dia, hora, minuto)
                  )
                  return (
                    <div key={`${dia.toISOString()}-${hora}-${minuto}`} className="border-b border-r border-slate-50 p-0.5 min-h-[28px] relative">
                      {eventos.map((ev) => (
                        <Link
                          key={ev.id}
                          href={`/reservas/${ev.reservaId}`}
                          className={`block text-[9px] leading-tight px-1 py-0.5 rounded mb-0.5 truncate ${
                            ev.status === 'CONFIRMADA' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                          }`}
                          title={`${ev.titulo} — ${statusLabel[ev.status as StatusReserva]}`}
                        >
                          {ev.laboratorio?.codigo ?? '—'} {ev.disciplina}
                        </Link>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
