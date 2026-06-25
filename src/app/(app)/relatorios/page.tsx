'use client'

import { useState } from 'react'
import {
  CalendarDays, CheckCircle2, Clock, AlertTriangle,
  XCircle, Download, Loader2, Filter, ShieldAlert,
  Users, FlaskConical, BarChart3, RefreshCw,
} from 'lucide-react'
import { subDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  useRelatorio, useLogsAuditoria, exportarCSVReservas,
  type FiltrosRelatorio, type FiltrosAuditoria,
} from '@/hooks/useRelatorios'
import { StatCard } from '@/components/relatorios/stat-card'
import { BarraHorizontal } from '@/components/relatorios/barra-horizontal'
import { EvolucaoChart } from '@/components/relatorios/evolucao-chart'
import { Pagination } from '@/components/ui/pagination'
import { PageHeader } from '@/components/ui/page-header'

// ─── Labels ──────────────────────────────────────────────────────────────────

const statusLabel: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: 'Aguardando',
  CONFIRMADA:             'Confirmada',
  CONFLITO_DE_DATAS:      'Conflito',
  REJEITADA:              'Rejeitada',
  CRIADA:                 'Criada',
}

const acaoLabel: Record<string, string> = {
  CRIAR:          'Criar',
  EDITAR:         'Editar',
  EXCLUIR:        'Excluir',
  CONFIRMAR:      'Confirmar',
  REJEITAR:       'Rejeitar',
  REAGENDAR:      'Reagendar',
  MARCAR_CONFLITO:'Conflito',
  UPLOAD_ANEXO:   'Anexo',
  LOGIN:          'Login',
  LOGOUT:         'Logout',
}

const entidadeLabel: Record<string, string> = {
  RESERVA:     'Reserva',
  LABORATORIO: 'Laboratório',
  PROFESSOR:   'Professor',
  TURMA:       'Turma',
  USUARIO:     'Usuário',
}

const acaoCor: Record<string, string> = {
  CRIAR:          'bg-green-100 text-green-700',
  EDITAR:         'bg-blue-100 text-blue-700',
  EXCLUIR:        'bg-red-100 text-red-700',
  CONFIRMAR:      'bg-green-100 text-green-700',
  REJEITAR:       'bg-red-100 text-red-700',
  REAGENDAR:      'bg-amber-100 text-amber-700',
  MARCAR_CONFLITO:'bg-orange-100 text-orange-700',
  UPLOAD_ANEXO:   'bg-slate-100 text-slate-700',
  LOGIN:          'bg-purple-100 text-purple-700',
  LOGOUT:         'bg-slate-100 text-slate-600',
}

// ─── Período rápido ───────────────────────────────────────────────────────────

const PERIODOS = [
  { label: '7 dias',  dias: 7  },
  { label: '15 dias', dias: 15 },
  { label: '30 dias', dias: 30 },
  { label: '90 dias', dias: 90 },
]

type Aba = 'metricas' | 'auditoria'

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const hoje = new Date()

  const [aba, setAba] = useState<Aba>('metricas')
  const [periodoDias, setPeriodoDias] = useState(30)
  const [de,  setDe]  = useState<Date>(subDays(hoje, 30))
  const [ate, setAte] = useState<Date>(hoje)

  // Filtros de auditoria
  const [filtroAcao,     setFiltroAcao]     = useState('')
  const [filtroEntidade, setFiltroEntidade] = useState('')
  const [pageAudit,      setPageAudit]      = useState(1)

  const filtrosRel: FiltrosRelatorio = { de, ate }
  const filtrosAudit: FiltrosAuditoria = {
    de, ate,
    acao:     filtroAcao     || undefined,
    entidade: filtroEntidade || undefined,
    page:     pageAudit,
    limit:    50,
  }

  const { data: rel,   isLoading: loadingRel,   refetch: refetchRel   } = useRelatorio(filtrosRel)
  const { data: audit, isLoading: loadingAudit, refetch: refetchAudit } = useLogsAuditoria(filtrosAudit)

  function aplicarPeriodo(dias: number) {
    setPeriodoDias(dias)
    setDe(subDays(hoje, dias))
    setAte(hoje)
    setPageAudit(1)
  }

  function aplicarDatasCustom(campo: 'de' | 'ate', valor: string) {
    if (!valor) return
    const data = new Date(valor + 'T00:00:00')
    if (campo === 'de') { setDe(data); setPeriodoDias(0) }
    else                { setAte(data); setPeriodoDias(0) }
    setPageAudit(1)
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <PageHeader
        title="Relatórios e Auditoria"
        subtitle="Métricas de uso do sistema e log de todas as operações realizadas."
        action={
          <button
            className="btn-secondary btn-sm"
            onClick={() => exportarCSVReservas(de, ate)}
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        }
      />

      {/* ─── Abas ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {([
          { id: 'metricas',  label: 'Métricas',   icon: BarChart3   },
          { id: 'auditoria', label: 'Auditoria',   icon: ShieldAlert },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              aba === id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ─── Filtros de período ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => aplicarPeriodo(p.dias)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                periodoDias === p.dias
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Filter className="w-3.5 h-3.5" />
          <input
            type="date"
            className="input py-1.5 text-xs w-36"
            value={format(de, 'yyyy-MM-dd')}
            max={format(ate, 'yyyy-MM-dd')}
            onChange={(e) => aplicarDatasCustom('de', e.target.value)}
          />
          <span>até</span>
          <input
            type="date"
            className="input py-1.5 text-xs w-36"
            value={format(ate, 'yyyy-MM-dd')}
            min={format(de, 'yyyy-MM-dd')}
            max={format(hoje, 'yyyy-MM-dd')}
            onChange={(e) => aplicarDatasCustom('ate', e.target.value)}
          />
        </div>

        <button
          className="btn-ghost btn-sm p-1.5"
          title="Atualizar dados"
          onClick={() => { refetchRel(); refetchAudit() }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ─── Aba: Métricas ──────────────────────────────────────────────── */}
      {aba === 'metricas' && (
        loadingRel ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : rel ? (
          <div className="flex flex-col gap-6">
            {/* Cards de totais */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                titulo="Total de reservas"
                valor={rel.reservas.total}
                subtitulo="no período"
                icon={CalendarDays}
                cor="blue"
              />
              <StatCard
                titulo="Confirmadas"
                valor={rel.reservas.porStatus.find((s) => s.status === 'CONFIRMADA')?.total ?? 0}
                subtitulo={rel.reservas.total > 0
                  ? `${Math.round(((rel.reservas.porStatus.find((s) => s.status === 'CONFIRMADA')?.total ?? 0) / rel.reservas.total) * 100)}% do total`
                  : undefined}
                icon={CheckCircle2}
                cor="green"
              />
              <StatCard
                titulo="Aguardando"
                valor={rel.reservas.porStatus.find((s) => s.status === 'AGUARDANDO_CONFIRMACAO')?.total ?? 0}
                icon={Clock}
                cor="amber"
              />
              <StatCard
                titulo="Conflitos / Rejeitadas"
                valor={(rel.reservas.porStatus.find((s) => s.status === 'CONFLITO_DE_DATAS')?.total ?? 0) +
                       (rel.reservas.porStatus.find((s) => s.status === 'REJEITADA')?.total ?? 0)}
                icon={XCircle}
                cor="red"
              />
            </div>

            {/* Tempo médio */}
            {rel.reservas.tempoMedioConfirmacaoHoras !== null && (
              <div className="card p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-600">Tempo médio de confirmação</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {(() => {
                      // Force the value to a number to guarantee runtime safety
                      const tempo = Number(rel.reservas.tempoMedioConfirmacaoHoras)
                      
                      return tempo < 1
                        ? `${Math.round(tempo * 60)} min`
                        : `${tempo.toFixed(1)} h`
                    })()}
                  </p>
                </div>
              </div>
            )}

            {/* Gráfico de evolução */}
            <EvolucaoChart pontos={rel.reservas.evolucaoDiaria} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Por status */}
              <BarraHorizontal
                titulo="Reservas por status"
                cor="bg-blue-500"
                itens={rel.reservas.porStatus.map((s) => ({
                  label: statusLabel[s.status] ?? s.status,
                  valor: s.total,
                }))}
              />

              {/* Por modalidade */}
              <BarraHorizontal
                titulo="Reservas por modalidade"
                cor="bg-purple-500"
                itens={rel.reservas.porModalidade.map((m) => ({
                  label: m.modalidade,
                  valor: m.total,
                }))}
              />

              {/* Top laboratórios */}
              <BarraHorizontal
                titulo="Laboratórios mais solicitados"
                cor="bg-green-500"
                vazio="Nenhuma reserva com laboratório confirmado"
                itens={rel.reservas.porLaboratorio.map((l) => ({
                  label:    l.laboratorio?.nome ?? 'Sem laboratório',
                  sublabel: l.laboratorio?.codigo,
                  valor:    l.total,
                }))}
              />

              {/* Top professores */}
              <BarraHorizontal
                titulo="Professores com mais reservas"
                cor="bg-amber-500"
                itens={rel.reservas.porProfessor.map((p) => ({
                  label: p.professor?.nome ?? p.professorId,
                  valor: p.total,
                }))}
              />
            </div>

            {/* Métricas de auditoria (resumo) */}
            <div className="card p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-slate-400" />
                  Operações registradas no período
                </h3>
                <button
                  onClick={() => setAba('auditoria')}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Ver log completo →
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xl font-bold text-slate-900">{rel.auditoria.totalOperacoes}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Total de operações</p>
                </div>
                {rel.auditoria.porAcao.slice(0, 3).map((a) => (
                  <div key={a.acao} className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xl font-bold text-slate-900">{a.total}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{acaoLabel[a.acao] ?? a.acao}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null
      )}

      {/* ─── Aba: Auditoria ─────────────────────────────────────────────── */}
      {aba === 'auditoria' && (
        <div className="flex flex-col gap-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <select
              className="input text-sm py-1.5 w-40"
              value={filtroAcao}
              onChange={(e) => { setFiltroAcao(e.target.value); setPageAudit(1) }}
            >
              <option value="">Todas as ações</option>
              {Object.entries(acaoLabel).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            <select
              className="input text-sm py-1.5 w-44"
              value={filtroEntidade}
              onChange={(e) => { setFiltroEntidade(e.target.value); setPageAudit(1) }}
            >
              <option value="">Todas as entidades</option>
              {Object.entries(entidadeLabel).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            {(filtroAcao || filtroEntidade) && (
              <button
                className="text-xs text-slate-500 hover:text-slate-800 underline"
                onClick={() => { setFiltroAcao(''); setFiltroEntidade(''); setPageAudit(1) }}
              >
                Limpar filtros
              </button>
            )}

            {audit && (
              <span className="text-xs text-slate-400 ml-auto">
                {audit.total} registro{audit.total !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="card">
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data/hora</th>
                    <th>Usuário</th>
                    <th>Ação</th>
                    <th>Entidade</th>
                    <th>Descrição</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAudit && (
                    <tr>
                      <td colSpan={6} className="text-center py-10">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                      </td>
                    </tr>
                  )}
                  {!loadingAudit && (audit?.logs.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400 text-sm">
                        Nenhum registro encontrado.
                      </td>
                    </tr>
                  )}
                  {audit?.logs.map((log) => (
                    <tr key={log.id}>
                      <td className="text-xs text-slate-500 whitespace-nowrap">
                        {new Intl.DateTimeFormat('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        }).format(new Date(log.criadoEm))}
                      </td>
                      <td>
                        <p className="text-sm font-medium text-slate-800">{log.usuario.nome}</p>
                        <p className="text-[10px] text-slate-400">{log.usuario.perfil}</p>
                      </td>
                      <td>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${acaoCor[log.acao] ?? 'bg-slate-100 text-slate-600'}`}>
                          {acaoLabel[log.acao] ?? log.acao}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          {entidadeLabel[log.entidade] ?? log.entidade}
                        </span>
                      </td>
                      <td className="text-sm text-slate-600 max-w-xs">
                        <p className="truncate" title={log.descricao}>{log.descricao}</p>
                      </td>
                      <td className="text-xs text-slate-400 font-mono">
                        {log.ip ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {audit && (
              <Pagination
                page={pageAudit}
                limit={audit.limit}
                total={audit.total}
                onPageChange={setPageAudit}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}