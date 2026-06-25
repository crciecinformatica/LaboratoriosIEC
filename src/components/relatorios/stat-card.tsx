'use client'

import type { LucideIcon } from 'lucide-react'

interface Props {
  titulo:   string
  valor:    string | number
  subtitulo?: string
  icon:     LucideIcon
  cor?:     'blue' | 'green' | 'amber' | 'red' | 'purple' | 'slate'
}

const esquemas = {
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   valor: 'text-blue-900'   },
  green:  { bg: 'bg-green-50',  icon: 'text-green-600',  valor: 'text-green-900'  },
  amber:  { bg: 'bg-amber-50',  icon: 'text-amber-600',  valor: 'text-amber-900'  },
  red:    { bg: 'bg-red-50',    icon: 'text-red-600',    valor: 'text-red-900'    },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', valor: 'text-purple-900' },
  slate:  { bg: 'bg-slate-50',  icon: 'text-slate-600',  valor: 'text-slate-900'  },
}

export function StatCard({ titulo, valor, subtitulo, icon: Icon, cor = 'blue' }: Props) {
  const e = esquemas[cor]
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className={`w-10 h-10 rounded-xl ${e.bg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${e.icon}`} />
      </div>
      <div>
        <p className={`text-2xl font-bold ${e.valor}`}>{valor}</p>
        <p className="text-sm font-medium text-slate-700 mt-0.5">{titulo}</p>
        {subtitulo && <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>}
      </div>
    </div>
  )
}