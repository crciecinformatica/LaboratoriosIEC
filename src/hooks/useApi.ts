import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

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

// ─── Laboratórios ─────────────────────────────────────────────────────────────

export function useLaboratorios(search = '') {
  return useGet<Laboratorio[]>(
    ['laboratorios'],
    '/api/laboratorios',
    search ? { q: search } : undefined
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

export function useProfessores(search = '') {
  return useGet<Professor[]>(
    ['professores'],
    '/api/professores',
    search ? { q: search } : undefined
  )
}

export function useCreateProfessor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.post('/api/professores', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['professores'] }),
  })
}

// ─── Turmas ───────────────────────────────────────────────────────────────────

export function useTurmas(search = '', professorId = '') {
  return useGet<Turma[]>(
    ['turmas'],
    '/api/turmas',
    { ...(search ? { q: search } : {}), ...(professorId ? { professorId } : {}) }
  )
}

export function useCreateTurma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.post('/api/turmas', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turmas'] }),
  })
}

// ─── Usuários ─────────────────────────────────────────────────────────────────

export function useUsuarios(search = '') {
  return useGet<UsuarioPublico[]>(
    ['usuarios'],
    '/api/usuarios',
    search ? { q: search } : undefined
  )
}

export function useCreateUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.post('/api/usuarios', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })
}

// ─── Reservas ─────────────────────────────────────────────────────────────────

export function useReservas(status = '') {
  return useGet<ReservaListItem>(
    ['reservas'],
    '/api/reservas',
    status ? { status } : undefined
  )
}

export function useCreateReserva() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => axios.post('/api/reservas', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
}

// ─── Tipos locais ─────────────────────────────────────────────────────────────

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

type ReservaListItem = {
  reservas: unknown[]; total: number; page: number; limit: number
}
