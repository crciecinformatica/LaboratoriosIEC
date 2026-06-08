'use client'

import { useState } from 'react'
import {
  useTurmas,
  useProfessores,
  useCreateTurma,
  useUpdateTurma,
  useDeleteTurma,
  type Turma,
} from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { criarTurmaSchema, CriarTurmaInput } from '@/lib/validations/reserva'
import { Plus, Pencil, Trash2, BookOpen, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'

export default function TurmasPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Turma | null>(null)

  const { data, isLoading } = useTurmas(search, '', page)
  const { data: profData } = useProfessores('', 1, 100)
  const criar = useCreateTurma()
  const excluir = useDeleteTurma()
  const toast = useToast()

  const turmas = data?.turmas ?? []
  const total = data?.total ?? 0
  const limit = data?.limit ?? 20
  const professores = profData?.professores ?? []
  const colSpan = 5

  const atualizar = useUpdateTurma(editing?.id ?? '')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CriarTurmaInput>({
    resolver: zodResolver(criarTurmaSchema),
  })

  function openCreate() {
    setEditing(null)
    reset({ codigo: '', nome: '', semestre: '', professorId: '' })
    setModalOpen(true)
  }

  function openEdit(turma: Turma) {
    setEditing(turma)
    reset({
      codigo: turma.codigo,
      nome: turma.nome,
      semestre: turma.semestre,
      professorId: turma.professor.id,
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    reset()
  }

  async function onSubmit(formData: CriarTurmaInput) {
    try {
      if (editing) {
        await atualizar.mutateAsync(formData)
        toast.success('Turma atualizada com sucesso!')
      } else {
        await criar.mutateAsync(formData)
        toast.success('Turma criada com sucesso!')
      }
      closeModal()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (editing ? 'Erro ao atualizar turma' : 'Erro ao criar turma')
      toast.error(msg)
    }
  }

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return
    try {
      await excluir.mutateAsync(id)
      toast.success('Turma excluída.')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao excluir turma.'
      toast.error(msg)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <PageHeader
        title="Turmas"
        subtitle="Gerencie as turmas vinculadas aos professores."
        action={
          <button className="btn-primary btn-sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Nova turma
          </button>
        }
      />

      <SearchInput
        value={search}
        onChange={(v) => { setSearch(v); setPage(1) }}
        placeholder="Buscar por nome ou código..."
      />

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Semestre</th>
                <th>Professor</th>
                <th className="text-right">Ações</th>
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
              {!isLoading && turmas.length === 0 && (
                <EmptyState message="Nenhuma turma encontrada." colSpan={colSpan} />
              )}
              {turmas.map((turma) => (
                <tr key={turma.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{turma.codigo}</code>
                    </div>
                  </td>
                  <td className="font-medium text-slate-800">{turma.nome}</td>
                  <td><span className="badge badge-blue">{turma.semestre}</span></td>
                  <td className="text-slate-600">{turma.professor.nome}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn-ghost btn-sm p-1.5" title="Editar" onClick={() => openEdit(turma)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"
                        title="Excluir"
                        onClick={() => handleDelete(turma.id, turma.nome)}
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
        title={editing ? 'Editar turma' : 'Nova turma'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 flex flex-col gap-4">
          <div className="form-row">
            <div className="form-group">
              <label className="label">Código <span className="text-red-500">*</span></label>
              <input {...register('codigo')} className="input" placeholder="INFO-2025-01" />
              {errors.codigo && <p className="error-msg">{errors.codigo.message}</p>}
            </div>
            <div className="form-group">
              <label className="label">Semestre <span className="text-red-500">*</span></label>
              <input {...register('semestre')} className="input" placeholder="2025/1" />
              {errors.semestre && <p className="error-msg">{errors.semestre.message}</p>}
            </div>
          </div>

          <div className="form-group">
            <label className="label">Nome <span className="text-red-500">*</span></label>
            <input {...register('nome')} className="input" placeholder="Programação Web" />
            {errors.nome && <p className="error-msg">{errors.nome.message}</p>}
          </div>

          <div className="form-group">
            <label className="label">Professor <span className="text-red-500">*</span></label>
            <select {...register('professorId')} className="input">
              <option value="">Selecione um professor</option>
              {professores.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            {errors.professorId && <p className="error-msg">{errors.professorId.message}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary btn-sm" onClick={closeModal}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {editing ? 'Salvar alterações' : 'Criar turma'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
