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
    mutationFn: (reservaId: string) =>
      axios.post('/api/reservas/conflito', { reservaId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
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
}

type Professor = {
  id: string; nome: string; email: string; matricula: string | null
  departamento: string | null; ativo: boolean
  _count: { turmas: number; reservas: number }
}

type Turma = {
  id: string; codigo: string; nome: string; semestre: string
  professor: { id: string; nome: string }
}

type UsuarioPublico = {
  id: string; nome: string; email: string; perfil: string; ativo: boolean; criadoEm: string
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
  datas: { id: string; dataInicio: string; dataFim: string; recorrente: boolean }[]
}

type PaginatedReservas = PaginatedResponse<ReservaResumo, 'reservas'>

type ReservaDetalhe = ReservaResumo & {
  descricao: string | null
  motivoRejeicao: string | null
  solicitante: { id: string; nome: string; email: string }
  professor: { id: string; nome: string; email: string }
  turma: { id: string; codigo: string; nome: string; semestre: string }
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

export type { Laboratorio, Professor, Turma, UsuarioPublico, ReservaResumo, ReservaDetalhe }
