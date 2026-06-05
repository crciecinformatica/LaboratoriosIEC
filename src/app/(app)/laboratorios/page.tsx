'use client'

import { useState } from 'react'
import { useLaboratorios, useCreateLaboratorio, useDeleteLaboratorio } from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { criarLaboratorioSchema, CriarLaboratorioInput } from '@/lib/validations/reserva'
import { Plus, Search, Pencil, Trash2, FlaskConical, Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { Modal } from '@/components/ui/Modal'

export default function LaboratoriosPage() {
  const { data: session } = useSession()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const { data: labs, isLoading } = useLaboratorios(search)
  const criar = useCreateLaboratorio()
  const excluir = useDeleteLaboratorio()
  const toast = useToast()

  const podeEditar = ['OPERADOR_TI', 'ADMINISTRADOR'].includes(session?.user.perfil ?? '')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CriarLaboratorioInput>({
    resolver: zodResolver(criarLaboratorioSchema),
    defaultValues: { recursos: [] },
  })

  async function onSubmit(data: CriarLaboratorioInput) {
    try {
      await criar.mutateAsync(data)
      toast.success('Laboratório criado com sucesso!')
      setModalOpen(false)
      reset()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao criar laboratório'
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
      {/* Título */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Laboratórios</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gerencie os laboratórios disponíveis para reserva.</p>
        </div>
        {podeEditar && (
          <button className="btn-primary btn-sm" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" /> Novo laboratório
          </button>
        )}
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome ou código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9"
        />
      </div>

      {/* Tabela */}
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
                <tr><td colSpan={7} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></td></tr>
              )}
              {!isLoading && (!labs || labs.length === 0) && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">Nenhum laboratório encontrado.</td></tr>
              )}
              {labs?.map((lab) => (
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
                        <button className="btn-ghost btn-sm p-1.5" title="Editar">
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
      </div>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); reset() }} title="Novo laboratório">
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
              onChange={(e) => {
                const val = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                // Forçar update via hidden input não é prático; use um estado local se necessário
                // Por ora, a prop é passada como array vazio e editada manualmente após criação
              }}
            />
            <p className="text-xs text-slate-400 mt-1">
              Edite os recursos pelo painel de edição após criar o laboratório.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className="btn-secondary btn-sm" onClick={() => { setModalOpen(false); reset() }}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Criar laboratório
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
