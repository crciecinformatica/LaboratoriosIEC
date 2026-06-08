'use client'

import { useState } from 'react'
import {
  useUsuarios,
  useCreateUsuario,
  useUpdateUsuario,
  useDeleteUsuario,
  type UsuarioPublico,
} from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  criarUsuarioSchema,
  editarUsuarioSchema,
  CriarUsuarioInput,
  EditarUsuarioInput,
} from '@/lib/validations/reserva'
import { Plus, Pencil, Trash2, Users, Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'

const PERFIS = [
  { value: 'APOIO_ACADEMICO', label: 'Apoio Acadêmico' },
  { value: 'OPERADOR_TI', label: 'Operador TI' },
  { value: 'ADMINISTRADOR', label: 'Administrador' },
] as const

const perfilLabel: Record<string, string> = {
  APOIO_ACADEMICO: 'Apoio Acadêmico',
  OPERADOR_TI: 'Operador TI',
  ADMINISTRADOR: 'Administrador',
}

export default function UsuariosPage() {
  const { data: session } = useSession()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<UsuarioPublico | null>(null)

  const { data, isLoading } = useUsuarios(search, page)
  const criar = useCreateUsuario()
  const excluir = useDeleteUsuario()
  const toast = useToast()

  const usuarios = data?.usuarios ?? []
  const total = data?.total ?? 0
  const limit = data?.limit ?? 20
  const colSpan = 5

  const atualizar = useUpdateUsuario(editing?.id ?? '')

  const createForm = useForm<CriarUsuarioInput>({
    resolver: zodResolver(criarUsuarioSchema),
    defaultValues: { perfil: 'APOIO_ACADEMICO' },
  })

  const editForm = useForm<EditarUsuarioInput>({
    resolver: zodResolver(editarUsuarioSchema),
  })

  const isCreate = !editing

  function openCreate() {
    setEditing(null)
    createForm.reset({ nome: '', email: '', senha: '', perfil: 'APOIO_ACADEMICO' })
    setModalOpen(true)
  }

  function openEdit(usuario: UsuarioPublico) {
    setEditing(usuario)
    editForm.reset({
      nome: usuario.nome,
      perfil: usuario.perfil as EditarUsuarioInput['perfil'],
      ativo: usuario.ativo,
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    createForm.reset()
    editForm.reset()
  }

  async function onSubmitCreate(formData: CriarUsuarioInput) {
    try {
      await criar.mutateAsync(formData)
      toast.success('Usuário criado com sucesso!')
      closeModal()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao criar usuário'
      toast.error(msg)
    }
  }

  async function onSubmitEdit(formData: EditarUsuarioInput) {
    try {
      await atualizar.mutateAsync(formData)
      toast.success('Usuário atualizado com sucesso!')
      closeModal()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao atualizar usuário'
      toast.error(msg)
    }
  }

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Desativar "${nome}"?`)) return
    try {
      await excluir.mutateAsync(id)
      toast.success('Usuário desativado.')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao desativar usuário.'
      toast.error(msg)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <PageHeader
        title="Usuários"
        subtitle="Gerencie os usuários e permissões do sistema."
        action={
          <button className="btn-primary btn-sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Novo usuário
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
                <th>Perfil</th>
                <th>Status</th>
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
              {!isLoading && usuarios.length === 0 && (
                <EmptyState message="Nenhum usuário encontrado." colSpan={colSpan} />
              )}
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className="font-medium text-slate-800">{usuario.nome}</span>
                    </div>
                  </td>
                  <td className="text-slate-600">{usuario.email}</td>
                  <td><span className="badge badge-blue">{perfilLabel[usuario.perfil] ?? usuario.perfil}</span></td>
                  <td>
                    <span className={`badge ${usuario.ativo ? 'badge-green' : 'badge-gray'}`}>
                      {usuario.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn-ghost btn-sm p-1.5" title="Editar" onClick={() => openEdit(usuario)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {usuario.id !== session?.user.id && (
                        <button
                          className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"
                          title="Desativar"
                          onClick={() => handleDelete(usuario.id, usuario.nome)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
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
        title={editing ? 'Editar usuário' : 'Novo usuário'}
      >
        {isCreate ? (
          <form onSubmit={createForm.handleSubmit(onSubmitCreate)} className="px-6 py-4 flex flex-col gap-4">
            <div className="form-group">
              <label className="label">Nome <span className="text-red-500">*</span></label>
              <input {...createForm.register('nome')} className="input" placeholder="Maria Santos" />
              {createForm.formState.errors.nome && (
                <p className="error-msg">{createForm.formState.errors.nome.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="label">Email <span className="text-red-500">*</span></label>
              <input {...createForm.register('email')} type="email" className="input" placeholder="maria@iec.edu.br" />
              {createForm.formState.errors.email && (
                <p className="error-msg">{createForm.formState.errors.email.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="label">Senha <span className="text-red-500">*</span></label>
              <input {...createForm.register('senha')} type="password" className="input" placeholder="••••••••" />
              {createForm.formState.errors.senha && (
                <p className="error-msg">{createForm.formState.errors.senha.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="label">Perfil <span className="text-red-500">*</span></label>
              <select {...createForm.register('perfil')} className="input">
                {PERFIS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {createForm.formState.errors.perfil && (
                <p className="error-msg">{createForm.formState.errors.perfil.message}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" className="btn-secondary btn-sm" onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary btn-sm" disabled={createForm.formState.isSubmitting}>
                {createForm.formState.isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Criar usuário
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="px-6 py-4 flex flex-col gap-4">
            <div className="form-group">
              <label className="label">Nome <span className="text-red-500">*</span></label>
              <input {...editForm.register('nome')} className="input" />
              {editForm.formState.errors.nome && (
                <p className="error-msg">{editForm.formState.errors.nome.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="label">Email</label>
              <input value={editing?.email ?? ''} className="input" disabled />
              <p className="text-xs text-slate-400 mt-1">O email não pode ser alterado.</p>
            </div>

            <div className="form-group">
              <label className="label">Perfil</label>
              <select {...editForm.register('perfil')} className="input">
                {PERFIS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="flex items-center gap-2 cursor-pointer">
                <input {...editForm.register('ativo')} type="checkbox" className="rounded" />
                <span className="text-sm text-slate-700">Usuário ativo</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" className="btn-secondary btn-sm" onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary btn-sm" disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Salvar alterações
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
