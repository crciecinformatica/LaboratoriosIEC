import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const DEFAULT_LIMIT = 20

// ─── GET ──────────────────────────────────────────────────────────────────────

export function useGet<T>(key: string[], url: string, params?: Record<string, string>) {
  return useQuery<T>({
    queryKey: [...key, params],
    queryFn: async () => {
      const { data } = await axios.get(url, { params })
      return data
    },
  })
}

function buildListParams(search: string, page: number, limit: number, extra?: Record<string, string>) {
  return {
    ...(search ? { q: search } : {}),
    page: String(page),
    limit: String(limit),
    ...extra,
  }
}

// ─── Laboratórios ─────────────────────────────────────────────────────────────

export function useLaboratorios(search = '', page = 1, limit = DEFAULT_LIMIT) {
  return useGet<PaginatedLaboratorios>(
    ['laboratorios'],
    '/api/laboratorios',
    buildListParams(search, page, limit)
  )
}

export function useCreateLaboratorio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.post('/api/laboratorios', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laboratorios'] }),
  })
}

export function useUpdateLaboratorio(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.patch(`/api/laboratorios/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laboratorios'] }),
  })
}

export function useDeleteLaboratorio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => axios.delete(`/api/laboratorios/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laboratorios'] }),
  })
}

// ─── Professores ──────────────────────────────────────────────────────────────

export function useProfessores(search = '', page = 1, limit = DEFAULT_LIMIT) {
  return useGet<PaginatedProfessores>(
    ['professores'],
    '/api/professores',
    buildListParams(search, page, limit)
  )
}

export function useCreateProfessor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.post('/api/professores', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professores'] }),
  })
}

export function useUpdateProfessor(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.patch(`/api/professores/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professores'] }),
  })
}

export function useDeleteProfessor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => axios.delete(`/api/professores/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professores'] }),
  })
}

// ─── Turmas ───────────────────────────────────────────────────────────────────

export function useTurmas(search = '', professorId = '', page = 1, limit = DEFAULT_LIMIT) {
  return useGet<PaginatedTurmas>(
    ['turmas'],
    '/api/turmas',
    buildListParams(search, page, limit, professorId ? { professorId } : undefined)
  )
}

export function useCreateTurma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.post('/api/turmas', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turmas'] }),
  })
}

export function useUpdateTurma(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.patch(`/api/turmas/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turmas'] }),
  })
}

export function useDeleteTurma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => axios.delete(`/api/turmas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turmas'] }),
  })
}

// ─── Usuários ─────────────────────────────────────────────────────────────────

export function useUsuarios(search = '', page = 1, limit = DEFAULT_LIMIT) {
  return useGet<PaginatedUsuarios>(
    ['usuarios'],
    '/api/usuarios',
    buildListParams(search, page, limit)
  )
}

export function useCreateUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.post('/api/usuarios', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}

export function useUpdateUsuario(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.patch(`/api/usuarios/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}

export function useDeleteUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => axios.delete(`/api/usuarios/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}

// ─── Reservas ─────────────────────────────────────────────────────────────────

export function useReservas(status = '', page = 1, limit = DEFAULT_LIMIT) {
  return useGet<PaginatedReservas>(
    ['reservas'],
    '/api/reservas',
    {
      ...(status ? { status } : {}),
      page: String(page),
      limit: String(limit),
    }
  )
}

export function useReserva(id: string) {
  return useGet<ReservaDetalhe>(['reservas', id], `/api/reservas/${id}`)
}

export function useCreateReserva() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.post('/api/reservas', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
}

export function useConfirmReserva() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { reservaId: string; laboratorioId: string }) =>
      axios.post('/api/reservas/confirmar', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
}

export function useRejectReserva() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { reservaId: string; motivoRejeicao: string }) =>
      axios.post('/api/reservas/rejeitar', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
}

export function useMarcarConflitoReserva() {
  const qc = useQueryClient()
  return useMutation({
    // dataHorarioIds é opcional: se informado, marca só essas datas específicas;
    // se omitido, marca todas as datas da reserva (retrocompatível).
    mutationFn: (data: { reservaId: string; dataHorarioIds?: string[] }) =>
      axios.post('/api/reservas/conflito', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
}

export function useCorrigirConflito() {
  const qc = useQueryClient()
  return useMutation({
    // Envia array de datas no formato novo (dia / horaInicio / horaFim)
    mutationFn: (data: {
      reservaId: string
      datas: { dia: string; horaInicio: string; horaFim: string; recorrente?: boolean }[]
    }) => axios.post('/api/reservas/corrigir-conflito', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
}

export function useReagendarReserva() {
  const qc = useQueryClient()
  return useMutation({
    // Array de datas no formato novo: dia (YYYY-MM-DD) + horaInicio/horaFim (HH:MM)
    mutationFn: (data: {
      reservaId: string
      datas: { dia: string; horaInicio: string; horaFim: string; recorrente?: boolean }[]
    }) => axios.post('/api/reservas/reagendar', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
}

export function useKanbanReservas() {
  return useGet<KanbanData>(['reservas', 'kanban'], '/api/reservas/kanban')
}

export function useAgendaSemanal(semana = '') {
  return useGet<AgendaSemanal>(
    ['agenda'],
    '/api/dashboard/agenda',
    semana ? { semana } : undefined
  )
}

export function useCalendarioLaboratorios(laboratorioId = '', semana = '') {
  return useGet<CalendarioLabs>(
    ['calendario'],
    '/api/laboratorios/calendario',
    {
      ...(laboratorioId ? { laboratorioId } : {}),
      ...(semana ? { semana } : {}),
    }
  )
}

export function useUploadAnexo(reservaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return axios.post(`/api/reservas/${reservaId}/anexos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas', reservaId] })
      qc.invalidateQueries({ queryKey: ['reservas'] })
    },
  })
}

// ─── Integrações ──────────────────────────────────────────────────────────────

export interface LogIntegracao {
  id: string
  servico: string
  endpoint: string
  metodo: string
  payload: unknown
  resposta: unknown
  statusHttp: number | null
  erro: string | null
  criadoEm: string
}

export function useLogsIntegracao(filtros?: { servico?: string; erro?: boolean; page?: number; limit?: number }) {
  const params = {
    ...(filtros?.servico ? { servico: filtros.servico } : {}),
    ...(filtros?.erro ? { erro: 'true' } : {}),
    page: String(filtros?.page ?? 1),
    limit: String(filtros?.limit ?? 20),
  }
  return useGet<PaginatedLogs>(
    ['integracoes', 'logs', filtros],
    '/api/integracoes/logs',
    params
  )
}

type PaginatedLogs = PaginatedResponse<LogIntegracao, 'logs'>

// ─── Tipos locais ─────────────────────────────────────────────────────────────

type PaginatedResponse<T, K extends string> = {
  total: number
  page: number
  limit: number
} & Record<K, T[]>

type PaginatedLaboratorios = PaginatedResponse<Laboratorio, 'laboratorios'>
type PaginatedProfessores = PaginatedResponse<Professor, 'professores'>
type PaginatedTurmas = PaginatedResponse<Turma, 'turmas'>
type PaginatedUsuarios = PaginatedResponse<UsuarioPublico, 'usuarios'>

type Laboratorio = {
  id: string; nome: string; codigo: string; capacidade: number
  recursos: string[]; localizacao: string | null; ativo: boolean
  googleCalendarId: string | null
}

type Professor = {
  id: string; nome: string; email: string; matricula: string | null
  telefone: string | null; departamento: string | null; ativo: boolean
  _count: { turmas: number; reservas: number }
}

type Turma = {
  id: string; codigo: string; nome: string; semestre: string
  curso: string; numOferta: string | null; codigoDisciplina: string
  professor: { id: string; nome: string }
}

type UsuarioPublico = {
  id: string; nome: string; email: string; perfil: string; ativo: boolean; criadoEm: string; codigoPessoa: string;
}

// DataHorarioReserva no formato novo (dia Date + horaInicio/horaFim string)
export type DataHorario = {
  id: string
  dia: string          // ISO Date string (meia-noite UTC)
  horaInicio: string   // "HH:MM"
  horaFim: string      // "HH:MM"
  recorrente: boolean
  emConflito: boolean
}

type ReservaResumo = {
  id: string
  titulo: string
  status: string
  criadoEm: string
  solicitante: { id: string; nome: string }
  professor: { id: string; nome: string }
  turma: { id: string; codigo: string; nome: string }
  laboratorio: { id: string; nome: string; codigo: string } | null
  datas: DataHorario[]
}

type PaginatedReservas = PaginatedResponse<ReservaResumo, 'reservas'>

type ReservaDetalhe = ReservaResumo & {
  modalidadeReserva: string
  softwaresUtilizados: string
  numeroAlunos: number
  motivoRejeicao: string | null
  cscProtocolo: string | null
  solicitante: { id: string; nome: string; email: string }
  professor: { id: string; nome: string; email: string; matricula: string | null; telefone: string | null }
  turma: {
    id: string; codigo: string; nome: string; semestre: string
    curso: string; numOferta: string | null; codigoDisciplina: string
  }
  laboratorio: { id: string; nome: string; codigo: string; capacidade: number } | null
  historico: {
    id: string
    evento: string
    statusAntes: string | null
    statusDepois: string | null
    observacao: string | null
    criadoEm: string
    usuario: { id: string; nome: string }
  }[]
  anexos: {
    id: string
    nomeArquivo: string
    url: string
    tamanho: number
    mimeType: string
    criadoEm: string
  }[]
}

type KanbanCard = ReservaResumo
type KanbanData = { colunas: { status: string; reservas: KanbanCard[] }[] }
type AgendaEvento = {
  id: string; reservaId: string
  dia: string          // ISO Date string
  horaInicio: string   // "HH:MM"
  horaFim: string      // "HH:MM"
  titulo: string; disciplina: string; status: string
  laboratorio: { id: string; nome: string; codigo: string } | null
  professor: string
}
type AgendaSemanal = { inicio: string; fim: string; eventos: AgendaEvento[] }
type CalendarioLabs = AgendaSemanal & {
  laboratorios: { id: string; nome: string; codigo: string }[]
  eventos: (AgendaEvento & { turma?: string })[],
}

export type { Laboratorio, Professor, Turma, UsuarioPublico, ReservaResumo, ReservaDetalhe, KanbanCard }