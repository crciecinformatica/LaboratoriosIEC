import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { statusLabel, statusColor } from '@/types'
import { StatusReserva } from '@prisma/client'
import { CalendarDays, FlaskConical, Clock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { AgendaSemanal } from '@/components/dashboard/agenda-semanal'

async function getDashboardData(userId: string, perfil: string) {
  const isApoio = perfil === 'APOIO_ACADEMICO'
  const where   = isApoio ? { solicitanteId: userId } : {}

  const [total, confirmadas, aguardando, conflitos, recentes] = await Promise.all([
    prisma.solicitacaoReserva.count({ where }),
    prisma.solicitacaoReserva.count({ where: { ...where, status: 'CONFIRMADA' } }),
    prisma.solicitacaoReserva.count({ where: { ...where, status: 'AGUARDANDO_CONFIRMACAO' } }),
    prisma.solicitacaoReserva.count({ where: { ...where, status: 'CONFLITO_DE_DATAS' } }),
    prisma.solicitacaoReserva.findMany({
      where,
      include: {
        professor:   { select: { nome: true } },
        turma:       { select: { codigo: true } },
        laboratorio: { select: { nome: true } },
        // dia/horaInicio/horaFim agora vêm do array `datas` (DataHorarioReserva)
        datas: { orderBy: { dia: 'asc' } },
      },
      orderBy: { criadoEm: 'desc' },
      take: 5,
    }),
  ])

  return { total, confirmadas, aguardando, conflitos, recentes }
}

const colorMap: Record<string, string> = {
  gray: 'badge-gray', amber: 'badge-amber', green: 'badge-green',
  red: 'badge-red', blue: 'badge-blue',
}

// Formata uma data ISO/Date → "15/08/2025"
function formatarDia(dia: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(dia))
}

/** Resumo legível das datas da reserva: primeira data + indicação de quantas restam */
function resumoDatas(datas: { dia: Date | string }[]): string {
  if (datas.length === 0) return '—'
  if (datas.length === 1) return formatarDia(datas[0].dia)
  return `${formatarDia(datas[0].dia)} +${datas.length - 1}`
}

/** Horário da primeira data (ou '—' se não houver datas) */
function resumoHorario(datas: { horaInicio: string; horaFim: string }[]): string {
  if (datas.length === 0) return '—'
  const { horaInicio, horaFim } = datas[0]
  return `${horaInicio} — ${horaFim}${datas.length > 1 ? ' …' : ''}`
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const data = await getDashboardData(session.user.id, session.user.perfil)

  const cards = [
    { label: 'Total de reservas', value: data.total,       icon: CalendarDays, color: 'text-blue-600',  bg: 'bg-blue-50'  },
    { label: 'Confirmadas',       value: data.confirmadas,  icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Aguardando',        value: data.aguardando,   icon: Clock,        color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Conflitos',         value: data.conflitos,    icon: FlaskConical, color: 'text-red-600',   bg: 'bg-red-50'   },
  ]

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Olá, {session.user.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Visão geral do sistema de agendamento de laboratórios.
        </p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className="card p-5">
              <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{c.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
            </div>
          )
        })}
      </div>

      <AgendaSemanal />

      {/* Reservas recentes */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-slate-800">Reservas recentes</h2>
          <Link href="/reservas" className="text-xs text-blue-600 hover:underline">Ver todas</Link>
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Professor</th>
                <th>Turma</th>
                <th>Laboratório</th>
                <th>Data</th>
                <th>Horário</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentes.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    Nenhuma reserva encontrada.
                  </td>
                </tr>
              )}
              {data.recentes.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/reservas/${r.id}`}
                      className="font-medium text-slate-800 hover:text-blue-600 transition">
                      {r.titulo}
                    </Link>
                  </td>
                  <td className="text-slate-600">{r.professor.nome}</td>
                  <td className="text-slate-600">{r.turma.codigo}</td>
                  <td className="text-slate-500">{r.laboratorio?.nome ?? '—'}</td>
                  {/* Usa o array r.datas — nunca r.dia diretamente */}
                  <td className="text-slate-500 text-xs">{resumoDatas(r.datas)}</td>
                  <td className="text-slate-500 text-xs">{resumoHorario(r.datas)}</td>
                  <td>
                    <span className={`badge ${colorMap[statusColor[r.status as StatusReserva]] ?? 'badge-gray'}`}>
                      {statusLabel[r.status as StatusReserva]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}