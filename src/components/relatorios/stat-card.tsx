'use client'

import type { LucideIcon } from 'lucide-react'

interface Props {
  titulo:   string
  valor:    string | number
  subtitulo?: string
  icon:     LucideIcon
  cor?:     'blue' | 'green' | 'amber' | 'red' | 'purple' | 'slate'
}

// Mapeia cores semânticas para variáveis CSS que respeitam dark/light mode
const esquemas = {
  blue:   { bg: 'bg-primary/10',   icon: 'text-primary',     valor: 'text-primary-foreground'   },
  green:  { bg: 'bg-[var(--color-success-bg)]',  icon: 'text-[var(--color-success)]',  valor: 'text-[var(--color-success)]'  },
  amber:  { bg: 'bg-[var(--color-warning-bg)]', icon: 'text-[var(--color-warning)]', valor: 'text-[var(--color-warning)]' },
  red:    { bg: 'bg-[var(--color-danger-bg)]',   icon: 'text-[var(--color-danger)]',   valor: 'text-[var(--color-danger)]'   },
  'purple': { bg: 'bg-[var(--color-info-bg)]', icon: 'text-[var(--color-info)]', valor: 'text-[var(--color-info)]' },
  slate:  { bg: 'bg-muted', icon: 'text-muted-foreground', valor: 'text-foreground' },
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
        <p className="text-sm font-medium text-muted-foreground mt-0.5">{titulo}</p>
        {subtitulo && <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitulo}</p>}
      </div>
    </div>
  )
}