import { eventoLabel, statusLabel } from '@/types'
import type { StatusReserva, TipoEvento } from '@prisma/client'
import { Clock } from 'lucide-react'

type HistoricoItem = {
  id: string
  evento: string
  statusAntes: string | null
  statusDepois: string | null
  observacao: string | null
  criadoEm: string
  usuario: { id: string; nome: string } | null
}

export function HistoricoTimeline({ historico }: { historico: HistoricoItem[] }) {
  if (historico.length === 0) {
    return <p className="text-sm text-slate-400 py-4">Nenhum evento registrado.</p>
  }

  return (
    <ol className="relative border-l border-slate-200 ml-2 flex flex-col gap-4">
      {historico.map((item) => (
        <li key={item.id} className="ml-5">
          <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-blue-100 ring-4 ring-white">
            <Clock className="w-2 h-2 text-blue-600" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-slate-800">
              {eventoLabel[item.evento as TipoEvento] ?? item.evento}
            </p>
            {item.statusDepois && (
              <p className="text-xs text-slate-500">
                {item.statusAntes
                  ? `${statusLabel[item.statusAntes as StatusReserva]} → ${statusLabel[item.statusDepois as StatusReserva]}`
                  : statusLabel[item.statusDepois as StatusReserva]}
              </p>
            )}
            {item.observacao && (
              <p className="text-xs text-slate-600 mt-1">{item.observacao}</p>
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              {item.usuario?.nome ?? 'Sistema'} · {new Date(item.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
