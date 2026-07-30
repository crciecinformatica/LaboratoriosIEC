'use client'

import { useState } from 'react'
import { Plus, Edit2, Trash2, Loader2, Save } from 'lucide-react'
import { useFilasChamados, useCreateFilaChamado, useUpdateFilaChamado, useDeleteFilaChamado, type FilaChamado } from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { PageHeader } from '@/components/ui/page-header'
import { Modal } from '@/components/ui/modal'

export default function ConfiguracoesPage() {
  const { data, isLoading } = useFilasChamados(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FilaChamado | null>(null)
  const [formData, setFormData] = useState({ nome: '', flexfield: '', disparaTeams: false, ativo: true })
  
  const criar = useCreateFilaChamado()
  const atualizar = useUpdateFilaChamado(editing?.id ?? '')
  const excluir = useDeleteFilaChamado()
  const toast = useToast()

  function openCreate() {
    setEditing(null)
    setFormData({ nome: '', flexfield: '', disparaTeams: false, ativo: true })
    setModalOpen(true)
  }

  function openEdit(fila: FilaChamado) {
    setEditing(fila)
    setFormData({ nome: fila.nome, flexfield: fila.flexfield, disparaTeams: fila.disparaTeams, ativo: fila.ativo })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    
    if (!formData.nome || !formData.flexfield) {
      toast.error('Preencha o nome e o flexfield.')
      return
    }

    try {
      if (editing) {
        await atualizar.mutateAsync(formData)
        toast.success('Fila atualizada com sucesso')
      } else {
        await criar.mutateAsync(formData)
        toast.success('Fila criada com sucesso')
      }
      closeModal()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro desconhecido')
    }
  }

  async function handleDelete(fila: FilaChamado) {
    if (confirm(`Tem certeza que deseja excluir a fila ${fila.nome}?`)) {
      try {
        await excluir.mutateAsync(fila.id)
        toast.success('Fila excluída com sucesso')
      } catch (error: any) {
        toast.error(error.response?.data?.error || 'Erro desconhecido')
      }
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <PageHeader
        title="Configurações"
        subtitle="Gerencie parâmetros e integrações globais do sistema."
      />

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="text-lg font-medium text-foreground">Filas de Chamado CSC</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie os flexfields (campi) utilizados para abrir chamados na API do CSC.
            </p>
          </div>
          <button onClick={openCreate} className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Nova Fila
          </button>
        </div>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Flexfield</th>
                <th>Dispara Teams?</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              )}
              {data?.filas.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                    Nenhuma fila cadastrada.
                  </td>
                </tr>
              )}
              {data?.filas.map((fila) => (
                <tr key={fila.id}>
                  <td className="font-medium text-foreground">{fila.nome}</td>
                  <td className="font-mono text-sm">{fila.flexfield}</td>
                  <td>
                    {fila.disparaTeams ? (
                      <span className="badge badge-green">Sim</span>
                    ) : (
                      <span className="badge badge-gray">Não</span>
                    )}
                  </td>
                  <td>
                    {fila.ativo ? (
                      <span className="badge badge-blue">Ativo</span>
                    ) : (
                      <span className="badge badge-gray">Inativo</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(fila)} className="btn-icon">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(fila)} className="btn-icon text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Editar Fila CSC' : 'Nova Fila CSC'}>
        <form onSubmit={handleSave} className="px-6 py-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Preencha os dados da fila. O flexfield é o código numérico no catálogo do CSC.
          </p>

          <div className="form-group">
            <label className="label">Nome (ex: Praça da Liberdade)</label>
            <input
              required
              className="input"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="label">Flexfield (ex: 1381)</label>
            <input
              required
              className="input font-mono"
              value={formData.flexfield}
              onChange={(e) => setFormData({ ...formData, flexfield: e.target.value })}
            />
          </div>
          
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              className="rounded border-border bg-input w-4 h-4 accent-primary"
              checked={formData.disparaTeams}
              onChange={(e) => setFormData({ ...formData, disparaTeams: e.target.checked })}
            />
            <label className="text-sm font-medium">
              Disparar notificação no Teams ao abrir chamado nesta fila
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              className="rounded border-border bg-input w-4 h-4 accent-primary"
              checked={formData.ativo}
              onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
            />
            <label className="text-sm font-medium">
              Fila ativa (disponível para seleção)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-2">
            <button type="button" onClick={closeModal} className="btn-secondary btn-sm">
              Cancelar
            </button>
            <button type="submit" className="btn-primary btn-sm flex items-center gap-2" disabled={criar.isPending || atualizar.isPending}>
              {(criar.isPending || atualizar.isPending) ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Salvar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
