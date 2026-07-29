'use client'

import { CalendarDays, Clock } from 'lucide-react'

interface Item {
  label:    string
  valor:    number
  sublabel?: string
}

interface Props {
  titulo:    string
  itens:     Item[]
  cor?:      string  // 'success' | 'warning' | 'danger' | 'info' | 'primary'
  vazio?:    string
}

// Mapeia cores semânticas para variáveis CSS
const coresMap: Record<string, { bg: string; texto: string; border: string }> = {
  primary:   { bg: 'bg-primary/10',     texto: 'text-primary',     border: 'border-primary/20' },
  success:   { bg: 'bg-[var(--color-success-bg)]',   texto: 'text-[var(--color-success)]',   border: 'border-[var(--color-success-border)]' },
  warning:   { bg: 'bg-[var(--color-warning-bg)]',   texto: 'text-[var(--color-warning)]',   border: 'border-[var(--color-warning-border)]' },
  danger:    { bg: 'bg-[var(--color-danger-bg)]',    texto: 'text-[var(--color-danger)]',    border: 'border-[var(--color-danger-border)]' },
  info:      { bg: 'bg-[var(--color-info-bg)]',      texto: 'text-[var(--color-info)]',      border: 'border-[var(--color-info-border)]' },
}

export function BarraHorizontal({ titulo, itens, cor = 'primary', vazio = 'Sem dados' }: Props) {
  const max = Math.max(...itens.map((i) => i.valor), 1)
  const c = coresMap[cor] ?? coresMap.primary

  return (
    <div className="card p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{vazio}</p>
      ) : (
        itens.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div className={`w-24 shrink-0 ${c.texto} font-medium truncate max-w-[200px]`} title={item.label}>
              {item.label}
            </div>
            <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${c.texto} transition-all duration-300`}
                style={{ width: `${(item.valor / max) * 100}%` }}
              />
            </div>
            <span className={`w-16 text-right text-sm ${c.texto} flex-shrink-0`}>
              {item.valor}
            </span>
            {item.sublabel && (
              <span className="text-[10px] text-muted-foreground/70 -mt-0.5 w-20 truncate">
                {item.sublabel}
              </span>
            )}
          </div>
        ))
      )}
    </div>
      )
    }