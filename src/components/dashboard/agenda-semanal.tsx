'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAgendaSemanal } from '@/hooks/useApi'
import { statusLabel } from '@/types'
import type { StatusReserva } from '@prisma/client'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

const colorMap: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: 'badge-amber',
  CONFIRMADA: 'badge-green',
}

export function AgendaSemanal() {
  const [semanaRef, setSemanaRef] = useState(new Date())
  const { data, isLoading } = useAgendaSemanal(semanaRef.toISOString())

  const inicio = startOfWeek(semanaRef, { weekStartsOn: 1 })
  const fim = endOfWeek(semanaRef, { weekStartsOn: 1 })

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Agenda semanal</h2>
        <div className="flex items-center gap-1">
          <button className="btn-ghost btn-sm p-1" onClick={() => setSemanaRef(subWeeks(semanaRef, 1))}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-slate-500">
            {format(inicio, 'd MMM', { locale: ptBR })} — {format(fim, 'd MMM', { locale: ptBR })}
          </span>
          <button className="btn-ghost btn-sm p-1" onClick={() => setSemanaRef(addWeeks(semanaRef, 1))}>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="p-4">
        {isLoading && <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />}
        {!isLoading && (data?.eventos.length ?? 0) === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Nenhum evento nesta semana.</p>
        )}
        <ul className="flex flex-col gap-2">
          {data?.eventos.map((ev) => (
            <li key={ev.id}>
              <Link
                href={`/reservas/${ev.reservaId}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition"
              >
                <div className="text-center min-w-[48px]">
                  {/* ev.dia substitui ev.dataInicio */}
                  <p className="text-xs font-bold text-slate-700">{format(new Date(ev.dia), 'dd')}</p>
                  <p className="text-[10px] text-slate-400">{format(new Date(ev.dia), 'MMM', { locale: ptBR })}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{ev.disciplina}</p>
                  <p className="text-xs text-slate-500">
                    {/* horaInicio/horaFim já vêm como "HH:MM" — sem precisar de format() */}
                    {ev.horaInicio} — {ev.horaFim}
                    {ev.laboratorio ? ` · ${ev.laboratorio.nome}` : ''}
                  </p>
                </div>
                <span className={`badge text-[10px] ${colorMap[ev.status] ?? 'badge-gray'}`}>
                  {statusLabel[ev.status as StatusReserva]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
