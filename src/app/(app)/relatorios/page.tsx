'use client'

import { useState } from 'react'
import {
  CalendarDays, CheckCircle2, Clock, AlertTriangle,
  XCircle, Download, Loader2, Filter, ShieldAlert,
  Users, FlaskConical, BarChart3, RefreshCw, Eye,
} from 'lucide-react'
import { subDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  useRelatorio, useLogsAuditoria, exportarCSVReservas,
  type FiltrosRelatorio, type FiltrosAuditoria,
  type LogOperacaoItem,
} from '@/hooks/useRelatorios'
import { StatCard } from '@/components/relatorios/stat-card'
import { BarraHorizontal } from '@/components/relatorios/barra-horizontal'
import { EvolucaoChart } from '@/components/relatorios/evolucao-chart'
import { Pagination } from '@/components/ui/pagination'
import { PageHeader } from '@/components/ui/page-header'
import { Modal } from '@/components/ui/modal'

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
  CRIAR:          'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  EDITAR:         'bg-primary/10 text-primary',
  EXCLUIR:        'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
  CONFIRMAR:      'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  REJEITAR:       'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
  REAGENDAR:      'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
  MARCAR_CONFLITO:'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
  UPLOAD_ANEXO:   'bg-muted text-muted-foreground',
  LOGIN:          'bg-[var(--color-info-bg)] text-[var(--color-info)]',
  LOGOUT:         'bg-muted text-muted-foreground',
}

// ─── Helper JSON ───────────────────────────────────────────────────────────────

function formatarJson(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

// ─── Período rápido ─────────────────────────────────────────────────────────────

const PERIODOS = [
  { label: '7 dias',  dias: 7  },
  { label: '15 dias', dias: 15 },
  { label: '30 dias', dias: 30 },
  { label: '90 dias', dias: 90 },
]

type Aba = 'metricas' | 'auditoria'

// ─── Componente principal ───────────────────────────────────────────────────────

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

  // Modal de detalhes de auditoria
  const [auditLogSelecionado, setAuditLogSelecionado] = useState<LogOperacaoItem | null>(null)

  function abrirDetalheAudit(log: LogOperacaoItem) {
    setAuditLogSelecionado(log)
  }

  function fecharDetalheAudit() {
    setAuditLogSelecionado(null)
  }

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
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {PERIODOS.map((p) => (
                  <button
                    key={p.dias}
                    onClick={() => aplicarPeriodo(p.dias)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                      periodoDias === p.dias
                        ? 'bg-background text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
                      <Clock className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Tempo médio de confirmação</p>
                        <p className="text-lg font-semibold text-foreground">
                          {(() => {
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
                      cor="primary"
                      itens={rel.reservas.porStatus.map((s) => ({
                        label: statusLabel[s.status] ?? s.status,
                        valor: s.total,
                      }))}
                    />

                    {/* Por modalidade */}
                    <BarraHorizontal
                      titulo="Reservas por modalidade"
                      cor="info"
                      itens={rel.reservas.porModalidade.map((m) => ({
                        label: m.modalidade,
                        valor: m.total,
                      }))}
                    />

                    {/* Top laboratórios */}
                    <BarraHorizontal
                      titulo="Laboratórios mais solicitados"
                      cor="success"
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
                      cor="warning"
                      itens={rel.reservas.porProfessor.map((p) => ({
                        label: p.professor?.nome ?? p.professorId,
                        valor: p.total,
                      }))}
                    />
                  </div>

            {/* Métricas de auditoria (resumo) */}
                        <div className="card p-5 flex flex-col gap-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                              <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                              Operações registradas no período
                            </h3>
                            <button
                              onClick={() => setAba('auditoria')}
                              className="text-xs text-primary hover:underline"
                            >
                              Ver log completo →
                            </button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-muted rounded-lg p-3">
                              <p className="text-xl font-bold text-foreground">{rel.auditoria.totalOperacoes}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Total de operações</p>
                            </div>
                            {rel.auditoria.porAcao.slice(0, 3).map((a) => (
                              <div key={a.acao} className="bg-muted rounded-lg p-3">
                                <p className="text-xl font-bold text-foreground">{a.total}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{acaoLabel[a.acao] ?? a.acao}</p>
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
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={() => { setFiltroAcao(''); setFiltroEntidade(''); setPageAudit(1) }}
                    >
                      Limpar filtros
                    </button>
                  )}

                  {audit && (
                    <span className="text-xs text-muted-foreground ml-auto">
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
                          <th className="w-12 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingAudit && (
                          <tr>
                            <td colSpan={7} className="text-center py-10">
                              <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                            </td>
                          </tr>
                        )}
                        {!loadingAudit && (audit?.logs.length ?? 0) === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                              Nenhum registro encontrado.
                            </td>
                          </tr>
                        )}
                        {audit?.logs.map((log) => (
                          <tr
                            key={log.id}
                            onClick={() => abrirDetalheAudit(log)}
                            className="cursor-pointer hover:bg-accent transition"
                          >
                            <td className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Intl.DateTimeFormat('pt-BR', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              }).format(new Date(log.criadoEm))}
                            </td>
                            <td>
                              <p className="text-sm font-medium text-foreground">{log.usuario.nome}</p>
                              <p className="text-[10px] text-muted-foreground">{log.usuario.perfil}</p>
                            </td>
                            <td>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${acaoCor[log.acao] ?? 'bg-muted text-muted-foreground'}`}>
                                {acaoLabel[log.acao] ?? log.acao}
                              </span>
                            </td>
                            <td>
                              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {entidadeLabel[log.entidade] ?? log.entidade}
                              </span>
                            </td>
                            <td className="text-sm text-muted-foreground max-w-xs">
                              <p className="truncate" title={log.descricao}>{log.descricao}</p>
                            </td>
                            <td className="text-xs text-muted-foreground font-mono">
                              {log.ip ?? '—'}
                            </td>
                            <td className="text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  abrirDetalheAudit(log)
                                }}
                                className="btn-ghost btn-sm p-1.5 text-muted-foreground hover:text-primary"
                                title="Ver detalhes"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
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

      {/* ─── Modal: Detalhes do Log de Auditoria ─────────────────────────── */}
      <Modal
              open={!!auditLogSelecionado}
              onClose={fecharDetalheAudit}
              title="Detalhes da Operação de Auditoria"
              size="lg"
            >
              {auditLogSelecionado && (
                <div className="px-6 py-4 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ID</p>
                      <p className="text-sm font-mono text-foreground bg-muted px-2 py-1 rounded">{auditLogSelecionado.id}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data/Hora</p>
                      <p className="text-sm text-foreground">
                        {new Intl.DateTimeFormat('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        }).format(new Date(auditLogSelecionado.criadoEm))}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Usuário</p>
                      <p className="text-sm font-medium text-foreground">{auditLogSelecionado.usuario.nome}</p>
                      <p className="text-xs text-muted-foreground">{auditLogSelecionado.usuario.email} · {auditLogSelecionado.usuario.perfil}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">IP</p>
                      <p className="text-sm font-mono text-muted-foreground">{auditLogSelecionado.ip ?? '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ação</p>
                      <span className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-1 rounded ${acaoCor[auditLogSelecionado.acao] ?? 'bg-muted text-muted-foreground'}`}>
                        {acaoLabel[auditLogSelecionado.acao] ?? auditLogSelecionado.acao}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Entidade</p>
                      <span className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded bg-muted text-foreground">
                        {entidadeLabel[auditLogSelecionado.entidade] ?? auditLogSelecionado.entidade}
                      </span>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ID da Entidade</p>
                      <p className="text-sm font-mono text-foreground bg-muted px-2 py-1 rounded">{auditLogSelecionado.entidadeId}</p>
                    </div>
                  </div>

                  <div className="space-y-1 pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descrição</p>
                    <p className="text-sm text-foreground bg-muted p-3 rounded">{auditLogSelecionado.descricao}</p>
                  </div>

                  {(() => {
                                if (!auditLogSelecionado.metadados) return null
                                const keys = Object.keys(auditLogSelecionado.metadados as Record<string, unknown>)
                                if (keys.length === 0) return null
                                return (
                                  <div className="space-y-1 pt-2 border-t border-border">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Metadados</p>
                                    <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto max-h-64">
                                      {formatarJson(auditLogSelecionado.metadados)}
                                    </pre>
                                  </div>
                                )
                              })()}

                  <div className="flex justify-end pt-4 border-t border-border">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={fecharDetalheAudit}
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )}
            </Modal>
    </div>
  )
}