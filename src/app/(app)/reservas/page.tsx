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

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'AGUARDANDO_CONFIRMACAO', label: 'Aguardando' },
  { value: 'CONFIRMADA', label: 'Confirmadas' },
  { value: 'CONFLITO_DE_DATAS', label: 'Conflitos' },
  { value: 'REJEITADA', label: 'Rejeitadas' },
]

const colorMap: Record<string, string> = {
  gray: 'badge-gray', amber: 'badge-amber', green: 'badge-green',
  red: 'badge-red', coral: 'badge-coral', blue: 'badge-blue',
}

export default function ReservasPage() {
  const { data: session } = useSession()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useReservas(status, page)
  const reservas = data?.reservas ?? []
  const total = data?.total ?? 0
  const limit = data?.limit ?? 20
  const colSpan = 6

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

      {/* Filtros por status */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              status === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
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
                <th>Data</th>
                <th>Status</th>
                <th>Laboratório</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={colSpan} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                  </td>
                </tr>
              )}
              {!isLoading && reservas.length === 0 && (
                <EmptyState message="Nenhuma reserva encontrada." colSpan={colSpan} />
              )}
              {reservas.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/reservas/${r.id}`} className="flex items-center gap-2 group">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className="font-medium text-slate-800 group-hover:text-blue-600 transition">
                        {r.titulo}
                      </span>
                    </Link>
                  </td>
                  <td className="text-slate-600">{r.professor.nome}</td>
                  <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.turma.codigo}</code></td>
                  <td className="text-slate-500 text-xs">
                    {r.datas[0]
                      ? new Date(r.datas[0].dataInicio).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td>
                    <span className={`badge ${colorMap[statusColor[r.status as StatusReserva]] ?? 'badge-gray'}`}>
                      {statusLabel[r.status as StatusReserva]}
                    </span>
                  </td>
                  <td className="text-slate-500">{r.laboratorio?.nome ?? '—'}</td>
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
