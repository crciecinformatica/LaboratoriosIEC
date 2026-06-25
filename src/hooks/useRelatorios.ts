import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { format } from 'date-fns'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface MetricaStatus   { status: string; total: number }
export interface MetricaModalidade { modalidade: string; total: number }
export interface MetricaLaboratorio {
  laboratorioId: string | null
  laboratorio: { id: string; nome: string; codigo: string } | null
  total: number
}
export interface MetricaProfessor {
  professorId: string
  professor: { id: string; nome: string } | null
  total: number
}
export interface MetricaDia { dia: string; total: number }
export interface MetricaAcao { acao: string; total: number }
export interface MetricaUsuarioOp {
  usuarioId: string
  usuario: { id: string; nome: string; perfil: string } | null
  total: number
}

export interface DadosRelatorio {
  periodo: { de: string; ate: string }
  reservas: {
    total: number
    porStatus: MetricaStatus[]
    porModalidade: MetricaModalidade[]
    porLaboratorio: MetricaLaboratorio[]
    porProfessor: MetricaProfessor[]
    evolucaoDiaria: MetricaDia[]
    tempoMedioConfirmacaoHoras: number | null
  }
  auditoria: {
    totalOperacoes: number
    porAcao: MetricaAcao[]
    porUsuario: MetricaUsuarioOp[]
  }
}

export interface LogOperacaoItem {
  id: string
  acao: string
  entidade: string
  entidadeId: string
  descricao: string
  metadados: unknown
  ip: string | null
  criadoEm: string
  usuario: { id: string; nome: string; email: string; perfil: string }
}

export interface FiltrosRelatorio {
  de?: Date
  ate?: Date
}

export interface FiltrosAuditoria {
  acao?: string
  entidade?: string
  usuarioId?: string
  de?: Date
  ate?: Date
  page?: number
  limit?: number
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useRelatorio(filtros: FiltrosRelatorio = {}) {
  const params: Record<string, string> = {}
  if (filtros.de)  params.de  = format(filtros.de,  'yyyy-MM-dd')
  if (filtros.ate) params.ate = format(filtros.ate, 'yyyy-MM-dd')

  return useQuery<DadosRelatorio>({
    queryKey: ['relatorio', params],
    queryFn:  () => axios.get('/api/relatorios', { params }).then((r) => r.data),
    staleTime: 60_000, // dados de relatório ficam frescos por 1 min
  })
}

export function useLogsAuditoria(filtros: FiltrosAuditoria = {}) {
  const params: Record<string, string> = {
    page:  String(filtros.page  ?? 1),
    limit: String(filtros.limit ?? 50),
  }
  if (filtros.acao)      params.acao      = filtros.acao
  if (filtros.entidade)  params.entidade  = filtros.entidade
  if (filtros.usuarioId) params.usuarioId = filtros.usuarioId
  if (filtros.de)        params.de        = format(filtros.de,  'yyyy-MM-dd')
  if (filtros.ate)       params.ate       = format(filtros.ate, 'yyyy-MM-dd')

  return useQuery<{ logs: LogOperacaoItem[]; total: number; page: number; limit: number }>({
    queryKey: ['auditoria', params],
    queryFn:  () => axios.get('/api/audit', { params }).then((r) => r.data),
  })
}

/** Dispara download do CSV de reservas no período */
export function exportarCSVReservas(de: Date, ate: Date) {
  const params = new URLSearchParams({
    tipo:    'csv',
    de:      format(de,  'yyyy-MM-dd'),
    ate:     format(ate, 'yyyy-MM-dd'),
    formato: 'csv',
  })
  window.open(`/api/relatorios?${params.toString()}`, '_blank')
}