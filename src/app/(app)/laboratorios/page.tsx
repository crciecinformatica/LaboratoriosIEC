'use client'

import { useState } from 'react'
import {
  useLaboratorios,
  useCreateLaboratorio,
  useUpdateLaboratorio,
  useDeleteLaboratorio,
  type Laboratorio,
} from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { criarLaboratorioSchema } from '@/lib/validations/reserva'
import type { z } from 'zod'

type LaboratorioFormInput = z.input<typeof criarLaboratorioSchema>
import { Plus, Pencil, Trash2, FlaskConical, Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'

export default function LaboratoriosPage() {
  const { data: session } = useSession()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Laboratorio | null>(null)
  const [recursosInput, setRecursosInput] = useState('')

  const { data, isLoading } = useLaboratorios(search, page)
  const criar = useCreateLaboratorio()
  const excluir = useDeleteLaboratorio()
  const toast = useToast()

  const labs = data?.laboratorios ?? []
  const total = data?.total ?? 0
  const limit = data?.limit ?? 20

  const podeEditar = ['OPERADOR_TI', 'ADMINISTRADOR'].includes(session?.user.perfil ?? '')
  const colSpan = podeEditar ? 7 : 6

  const atualizar = useUpdateLaboratorio(editing?.id ?? '')

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LaboratorioFormInput>({
    resolver: zodResolver(criarLaboratorioSchema),
    defaultValues: { recursos: [] },
  })

  function openCreate() {
    setEditing(null)
    setRecursosInput('')
    reset({ recursos: [] })
    setModalOpen(true)
  }

  function openEdit(lab: Laboratorio) {
    setEditing(lab)
    setRecursosInput(lab.recursos.join(', '))
    reset({
      nome: lab.nome,
      codigo: lab.codigo,
      capacidade: lab.capacidade,
      recursos: lab.recursos,
      localizacao: lab.localizacao ?? undefined,
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setRecursosInput('')
    reset({ recursos: [] })
  }

  async function onSubmit(formData: LaboratorioFormInput) {
    const payload = { ...formData, recursos: formData.recursos ?? [] }
    try {
      if (editing) {
        await atualizar.mutateAsync(payload)
        toast.success('Laboratório atualizado com sucesso!')
      } else {
        await criar.mutateAsync(payload)
        toast.success('Laboratório criado com sucesso!')
      }
      closeModal()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (editing ? 'Erro ao atualizar laboratório' : 'Erro ao criar laboratório')
      toast.error(msg)
    }
  }

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Desativar "${nome}"?`)) return
    try {
      await excluir.mutateAsync(id)
      toast.success('Laboratório desativado.')
    } catch {
      toast.error('Erro ao desativar laboratório.')
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <PageHeader
        title="Laboratórios"
        subtitle="Gerencie os laboratórios disponíveis para reserva."
        action={
          podeEditar ? (
            <button className="btn-primary btn-sm" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Novo laboratório
            </button>
          ) : undefined
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
                <th>Nome</th>
                <th>Código</th>
                <th>Capacidade</th>
                <th>Localização</th>
                <th>Recursos</th>
                <th>Status</th>
                {podeEditar && <th className="text-right">Ações</th>}
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
              {!isLoading && labs.length === 0 && (
                <EmptyState message="Nenhum laboratório encontrado." colSpan={colSpan} />
              )}
              {labs.map((lab) => (
                <tr key={lab.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <FlaskConical className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className="font-medium text-slate-800">{lab.nome}</span>
                    </div>
                  </td>
                  <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{lab.codigo}</code></td>
                  <td>{lab.capacidade} lugares</td>
                  <td className="text-slate-500">{lab.localizacao ?? '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {lab.recursos.slice(0, 3).map((r) => (
                        <span key={r} className="badge badge-blue text-[10px]">{r}</span>
                      ))}
                      {lab.recursos.length > 3 && (
                        <span className="badge badge-gray text-[10px]">+{lab.recursos.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${lab.ativo ? 'badge-green' : 'badge-gray'}`}>
                      {lab.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  {podeEditar && (
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="btn-ghost btn-sm p-1.5"
                          title="Editar"
                          onClick={() => openEdit(lab)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"
                          title="Desativar"
                          onClick={() => handleDelete(lab.id, lab.nome)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
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
        title={editing ? 'Editar laboratório' : 'Novo laboratório'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 flex flex-col gap-4">
          <div className="form-row">
            <div className="form-group">
              <label className="label">Nome <span className="text-red-500">*</span></label>
              <input {...register('nome')} className="input" placeholder="Laboratório de Informática 1" />
              {errors.nome && <p className="error-msg">{errors.nome.message}</p>}
            </div>
            <div className="form-group">
              <label className="label">Código <span className="text-red-500">*</span></label>
              <input {...register('codigo')} className="input" placeholder="LAB-INFO-01" />
              {errors.codigo && <p className="error-msg">{errors.codigo.message}</p>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="label">Capacidade <span className="text-red-500">*</span></label>
              <input
                {...register('capacidade', { valueAsNumber: true })}
                type="number" min={1} max={500}
                className="input"
                placeholder="30"
              />
              {errors.capacidade && <p className="error-msg">{errors.capacidade.message}</p>}
            </div>
            <div className="form-group">
              <label className="label">Localização</label>
              <input {...register('localizacao')} className="input" placeholder="Bloco A, Sala 101" />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Recursos (separados por vírgula)</label>
            <input
              className="input"
              placeholder="Computadores, Projetor, Ar-condicionado"
              value={recursosInput}
              onChange={(e) => {
                setRecursosInput(e.target.value)
                const val = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                setValue('recursos', val, { shouldValidate: true })
              }}
            />
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
              {editing ? 'Salvar alterações' : 'Criar laboratório'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
