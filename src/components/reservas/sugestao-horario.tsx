'use client'

import { Clock, Loader2, RefreshCw } from 'lucide-react'

export interface HorarioDisponivel {
  horaInicio: string
  horaFim:    string
}

interface Props {
  sugestoes:  HorarioDisponivel[]
  loading:    boolean
  selecionado: string | null   // "HH:MM|HH:MM"
  onSelecionar: (horario: HorarioDisponivel) => void
  onRecarregar?: () => void
}

export function SugestaoHorario({ sugestoes, loading, selecionado, onSelecionar, onRecarregar }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Buscando horários disponíveis…
      </div>
    )
  }

  if (sugestoes.length === 0) {
    return (
      <div className="py-4 text-sm text-slate-500">
        <p>Nenhum horário disponível para este dia com a duração solicitada.</p>
        {onRecarregar && (
          <button className="btn-ghost btn-sm mt-2 flex items-center gap-1.5 text-xs" onClick={onRecarregar}>
            <RefreshCw className="w-3.5 h-3.5" /> Tentar outro dia
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" />
        Horários disponíveis — escolha um:
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sugestoes.slice(0, 9).map((h) => {
          const key = `${h.horaInicio}|${h.horaFim}`
          const isSelected = selecionado === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelecionar(h)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <Clock className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
              {h.horaInicio} — {h.horaFim}
            </button>
          )
        })}
      </div>
      {sugestoes.length > 9 && (
        <p className="text-xs text-slate-400 mt-1">
          +{sugestoes.length - 9} horários adicionais disponíveis neste dia.
        </p>
      )}
    </div>
  )
}