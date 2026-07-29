'use client'

import { useState } from 'react'
import {
  useProfessores,
  useCreateProfessor,
  useUpdateProfessor,
  useDeleteProfessor,
  type Professor,
} from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { criarProfessorSchema, CriarProfessorInput } from '@/lib/validations/reserva'
import { Plus, Pencil, Trash2, GraduationCap, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'

export default function ProfessoresPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Professor | null>(null)

  const { data, isLoading } = useProfessores(search, page)
  const criar = useCreateProfessor()
  const excluir = useDeleteProfessor()
  const toast = useToast()

  const professores = data?.professores ?? []
  const total = data?.total ?? 0
  const limit = data?.limit ?? 20
  const colSpan = 7

  const atualizar = useUpdateProfessor(editing?.id ?? '')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CriarProfessorInput>({
    resolver: zodResolver(criarProfessorSchema),
  })

  function openCreate() {
    setEditing(null)
    reset({ nome: '', email: '', matricula: '', telefone: '', departamento: '' })
    setModalOpen(true)
  }

  function openEdit(prof: Professor) {
    setEditing(prof)
    reset({
      nome: prof.nome,
      email: prof.email,
      matricula: prof.matricula ?? '',
      telefone: prof.telefone ?? '',
      departamento: prof.departamento ?? '',
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    reset()
  }

  async function onSubmit(formData: CriarProfessorInput) {
    const payload = {
      ...formData,
      matricula: formData.matricula || undefined,
      telefone: formData.telefone || undefined,
      departamento: formData.departamento || undefined,
    }
    try {
      if (editing) {
        await atualizar.mutateAsync(payload)
        toast.success('Professor atualizado com sucesso!')
      } else {
        await criar.mutateAsync(payload)
        toast.success('Professor criado com sucesso!')
      }
      closeModal()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (editing ? 'Erro ao atualizar professor' : 'Erro ao criar professor')
      toast.error(msg)
    }
  }

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Desativar "${nome}"?`)) return
    try {
      await excluir.mutateAsync(id)
      toast.success('Professor desativado.')
    } catch {
      toast.error('Erro ao desativar professor.')
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <PageHeader
        title="Professores"
        subtitle="Cadastre e gerencie os professores vinculados às turmas."
        action={
          <button className="btn-primary btn-sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Novo professor
          </button>
        }
      />

      <SearchInput
        value={search}
        onChange={(v) => { setSearch(v); setPage(1) }}
        placeholder="Buscar por nome ou email..."
      />

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Código de pessoa / Matrícula</th>
                <th>Telefone</th>
                <th>Departamento</th>
                <th>Turmas / Reservas</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={colSpan} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              )}
              {!isLoading && professores.length === 0 && (
                <EmptyState message="Nenhum professor encontrado." colSpan={colSpan} />
              )}
              {professores.map((prof) => (
                <tr key={prof.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="font-medium text-foreground">{prof.nome}</span>
                    </div>
                  </td>
                  <td className="text-muted-foreground">{prof.email}</td>
                  <td>{prof.matricula ?? '—'}</td>
                  <td className="text-muted-foreground">{prof.telefone ?? '—'}</td>
                  <td className="text-muted-foreground">{prof.departamento ?? '—'}</td>
                  <td>
                    <span className="text-xs text-muted-foreground">
                      {prof._count.turmas} turma(s) · {prof._count.reservas} reserva(s)
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn-ghost btn-sm p-1.5" title="Editar" onClick={() => openEdit(prof)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"
                        title="Desativar"
                        onClick={() => handleDelete(prof.id, prof.nome)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} limit={limit} total={total} onPageChange={setPage} />
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Editar professor' : 'Novo professor'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 flex flex-col gap-4">
          <div className="form-group">
            <label className="label">Nome <span className="text-red-500">*</span></label>
            <input {...register('nome')} className="input" placeholder="Prof. João Silva" />
            {errors.nome && <p className="error-msg">{errors.nome.message}</p>}
          </div>

          <div className="form-group">
            <label className="label">Email <span className="text-red-500">*</span></label>
            <input {...register('email')} type="email" className="input" placeholder="joao.silva@iec.edu.br" />
            {errors.email && <p className="error-msg">{errors.email.message}</p>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="label">Código de pessoa / Matrícula</label>
              <input {...register('matricula')} className="input" placeholder="12345" />
            </div>
            <div className="form-group">
              <label className="label">Telefone</label>
              <input {...register('telefone')} className="input" placeholder="(11) 99999-0000" />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Departamento</label>
            <input {...register('departamento')} className="input" placeholder="Informática" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" className="btn-secondary btn-sm" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {editing ? 'Salvar alterações' : 'Criar professor'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
