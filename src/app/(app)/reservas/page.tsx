'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useReservas } from '@/hooks/useApi'
import { statusLabel, statusColor } from '@/types'
import type { StatusReserva } from '@prisma/client'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { Plus, CalendarDays, Loader2 } from 'lucide-react'

const STATUS_FILTERS = [
  { value: '',                       label: 'Todas'      },
  { value: 'AGUARDANDO_CONFIRMACAO', label: 'Aguardando' },
  { value: 'CONFIRMADA',             label: 'Confirmadas'},
  { value: 'CONFLITO_DE_DATAS',      label: 'Conflitos'  },
  { value: 'REJEITADA',              label: 'Rejeitadas' },
]

const colorMap: Record<string, string> = {
  gray: 'badge-gray', amber: 'badge-amber', green: 'badge-green',
  red: 'badge-red', coral: 'badge-coral', blue: 'badge-blue',
}

function formatarDia(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso))
}

function resumoDatas(datas: { dia: string; horaInicio: string; horaFim: string }[]): string {
  if (datas.length === 0) return '—'
  if (datas.length === 1) return formatarDia(datas[0].dia)
  return `${formatarDia(datas[0].dia)} + ${datas.length - 1} data${datas.length - 1 > 1 ? 's' : ''}`
}

function resumoHorario(datas: { horaInicio: string; horaFim: string }[]): string {
  if (datas.length === 0) return '—'
  const { horaInicio, horaFim } = datas[0]
  return `${horaInicio} — ${horaFim}${datas.length > 1 ? ' …' : ''}`
}

export default function ReservasPage() {
  const { data: session } = useSession()
  const [status, setStatus] = useState('')
  const [page,   setPage]   = useState(1)

  const { data, isLoading } = useReservas(status, page)
  const reservas = data?.reservas ?? []
  const total    = data?.total    ?? 0
  const limit    = data?.limit    ?? 20

  const podeCriar = ['APOIO_ACADEMICO', 'ADMINISTRADOR'].includes(session?.user.perfil ?? '')

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <PageHeader
        title="Reservas"
        subtitle="Acompanhe e gerencie as solicitações de laboratório."
        action={
          podeCriar ? (
            <Link href="/reservas/nova" className="btn-primary btn-sm">
              <Plus className="w-4 h-4" /> Nova reserva
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              status === f.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => { setStatus(f.value); setPage(1) }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Professor</th>
                <th>Turma</th>
                <th>Data(s)</th>
                <th>Horário</th>
                <th>Status</th>
                <th>Laboratório</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              )}
              {!isLoading && reservas.length === 0 && (
                <EmptyState message="Nenhuma reserva encontrada." colSpan={7} />
              )}
              {reservas.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/reservas/${r.id}`} className="flex items-center gap-2 group">
                      <div className="w-7 h-7 rounded-lg bg-[var(--color-info-bg)] flex items-center justify-center shrink-0">
                        <CalendarDays className="w-3.5 h-3.5 text-[var(--color-info)]" />
                      </div>
                      <span className="font-medium text-foreground group-hover:text-[var(--color-info)] transition">
                        {r.titulo}
                      </span>
                    </Link>
                  </td>
                  <td>{r.professor.nome}</td>
                  <td>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {r.turma.codigo}
                    </code>
                  </td>
                  <td className="text-muted-foreground text-xs">{resumoDatas(r.datas)}</td>
                  <td className="text-muted-foreground text-xs">{resumoHorario(r.datas)}</td>
                  <td>
                    <span className={`badge ${colorMap[statusColor[r.status as StatusReserva]] ?? 'badge-gray'}`}>
                      {statusLabel[r.status as StatusReserva]}
                    </span>
                  </td>
                  <td className="text-muted-foreground">{r.laboratorio?.nome ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} limit={limit} total={total} onPageChange={setPage} />
      </div>
    </div>
  )
}