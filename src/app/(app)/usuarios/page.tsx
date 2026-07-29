'use client'

import { useState } from 'react'
import {
  useUsuarios,
  useCreateUsuario,
  useUpdateUsuario,
  useDeleteUsuario,
  useSolicitacoesAcessoPendentes,
  useAprovarSolicitacaoAcesso,
  useNegarSolicitacaoAcesso,
  type UsuarioPublico,
  type SolicitacaoAcesso,
} from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  criarUsuarioSchema,
  editarUsuarioSchema,
  type CriarUsuarioInput,
  type EditarUsuarioInput,
} from '@/lib/validations/reserva'
import { Plus, Pencil, Trash2, Users, Loader2, UserCheck, UserX, Inbox } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'

const PERFIS = [
  { value: 'APOIO_ACADEMICO', label: 'Apoio Acadêmico' },
  { value: 'OPERADOR_TI',     label: 'Operador TI'     },
  { value: 'ADMINISTRADOR',   label: 'Administrador'   },
] as const

const perfilLabel: Record<string, string> = {
  APOIO_ACADEMICO: 'Apoio Acadêmico',
  OPERADOR_TI:     'Operador TI',
  ADMINISTRADOR:   'Administrador',
}

const perfilBadge: Record<string, string> = {
  APOIO_ACADEMICO: 'badge-blue',
  OPERADOR_TI:     'badge-amber',
  ADMINISTRADOR:   'badge-red',
}

export default function UsuariosPage() {
  const { data: session } = useSession()
  const [search, setSearch] = useState('')
  const [page,   setPage]   = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<UsuarioPublico | null>(null)

  const { data, isLoading } = useUsuarios(search, page)
  const criar   = useCreateUsuario()
  const excluir = useDeleteUsuario()
  const toast   = useToast()

  const { data: solicitacoesData, isLoading: isLoadingSolicitacoes } = useSolicitacoesAcessoPendentes()
  const aprovarSolicitacao = useAprovarSolicitacaoAcesso()
  const negarSolicitacao   = useNegarSolicitacaoAcesso()
  const [negandoId, setNegandoId] = useState<string | null>(null)
  const [motivoNegar, setMotivoNegar] = useState('')

  const solicitacoesPendentes = solicitacoesData?.solicitacoes ?? []

  const usuarios = data?.usuarios ?? []
  const total    = data?.total    ?? 0
  const limit    = data?.limit    ?? 20

  const atualizar = useUpdateUsuario(editing?.id ?? '')

  // ─── Forms ─────────────────────────────────────────────────────────────────

  const createForm = useForm<CriarUsuarioInput>({
    resolver: zodResolver(criarUsuarioSchema),
    defaultValues: { perfil: 'APOIO_ACADEMICO' },
  })

  const editForm = useForm<EditarUsuarioInput>({
    resolver: zodResolver(editarUsuarioSchema),
  })

  // ─── Modal helpers ──────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null)
    createForm.reset({ nome: '', email: '', senha: '', perfil: 'APOIO_ACADEMICO', codigoPessoa: '' })
    setModalOpen(true)
  }

  function openEdit(usuario: UsuarioPublico) {
    setEditing(usuario)
    editForm.reset({
      nome:         usuario.nome,
      perfil:       usuario.perfil as EditarUsuarioInput['perfil'],
      ativo:        usuario.ativo,
      codigoPessoa: usuario.codigoPessoa ?? '',
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    createForm.reset()
    editForm.reset()
  }

  // ─── Submits ────────────────────────────────────────────────────────────────

  async function onSubmitCreate(formData: CriarUsuarioInput) {
    try {
      await criar.mutateAsync({
        ...formData,
        codigoPessoa: formData.codigoPessoa || undefined,
      })
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
      await atualizar.mutateAsync({
        ...formData,
        codigoPessoa: formData.codigoPessoa || undefined,
      })
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

  // ─── Solicitações de acesso ──────────────────────────────────────────────────

  async function handleAprovar(solicitacao: SolicitacaoAcesso) {
    if (!confirm(`Aprovar acesso de "${solicitacao.nome}" (${solicitacao.email})?`)) return
    try {
      await aprovarSolicitacao.mutateAsync({ id: solicitacao.id })
      toast.success(`Acesso de "${solicitacao.nome}" aprovado.`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao aprovar solicitação.'
      toast.error(msg)
    }
  }

  function abrirNegar(id: string) {
    setNegandoId(id)
    setMotivoNegar('')
  }

  async function confirmarNegar() {
    if (!negandoId) return
    try {
      await negarSolicitacao.mutateAsync({ id: negandoId, motivo: motivoNegar || undefined })
      toast.success('Solicitação negada.')
      setNegandoId(null)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao negar solicitação.'
      toast.error(msg)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

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

      {/* ── Solicitações de acesso pendentes ───────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Solicitações de acesso pendentes
          </h2>
          <span className="badge badge-amber">{solicitacoesPendentes.length} pendente(s)</span>
        </div>

        {isLoadingSolicitacoes && (
          <div className="card px-4 py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoadingSolicitacoes && solicitacoesPendentes.length === 0 && (
          <div className="card px-4 py-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Inbox className="w-4 h-4" />
            Nenhuma solicitação de acesso aguardando aprovação.
          </div>
        )}

        {solicitacoesPendentes.map((solicitacao) => (
          <div
            key={solicitacao.id}
            className="card px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{solicitacao.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {solicitacao.email} · Cód. pessoa: {solicitacao.codigoPessoa}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="btn-secondary btn-sm"
                onClick={() => abrirNegar(solicitacao.id)}
                disabled={negarSolicitacao.isPending}
              >
                <UserX className="w-3.5 h-3.5" /> Negar
              </button>
              <button
                className="btn-primary btn-sm"
                onClick={() => handleAprovar(solicitacao)}
                disabled={aprovarSolicitacao.isPending}
              >
                <UserCheck className="w-3.5 h-3.5" /> Aprovar
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Perfil</th>
                <th>Cód. Pessoa</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              )}
              {!isLoading && usuarios.length === 0 && (
                <EmptyState message="Nenhum usuário encontrado." colSpan={6} />
              )}
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="font-medium text-foreground">{usuario.nome}</span>
                    </div>
                  </td>
                  <td className="text-muted-foreground">{usuario.email}</td>
                  <td>
                    <span className={`badge ${perfilBadge[usuario.perfil] ?? 'badge-blue'}`}>
                      {perfilLabel[usuario.perfil] ?? usuario.perfil}
                    </span>
                  </td>
                  <td className="text-muted-foreground font-mono text-xs">
                    {usuario.codigoPessoa ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td>
                    <span className={`badge ${usuario.ativo ? 'badge-green' : 'badge-gray'}`}>
                      {usuario.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="btn-ghost btn-sm p-1.5"
                        title="Editar"
                        onClick={() => openEdit(usuario)}
                      >
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

      {/* ── Modal criar/editar ─────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Editar usuário' : 'Novo usuário'}
      >
        {!editing ? (
          /* ── Formulário de CRIAÇÃO ─────────────────────────────────── */
          <form
            onSubmit={createForm.handleSubmit(onSubmitCreate)}
            className="px-6 py-4 flex flex-col gap-4"
          >
            <div className="form-group">
              <label className="label">Nome <span className="text-red-500">*</span></label>
              <input {...createForm.register('nome')} className="input" placeholder="Maria Santos" />
              {createForm.formState.errors.nome && (
                <p className="error-msg">{createForm.formState.errors.nome.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="label">Email <span className="text-red-500">*</span></label>
              <input {...createForm.register('email')} type="email" className="input"
                placeholder="maria@iec.edu.br" />
              {createForm.formState.errors.email && (
                <p className="error-msg">{createForm.formState.errors.email.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="label">Senha <span className="text-red-500">*</span></label>
              <input {...createForm.register('senha')} type="password" className="input"
                placeholder="••••••••" />
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

            <div className="form-group">
              <label className="label">
                Código PUC
                <span className="text-xs text-muted-foreground font-normal ml-1">(LoginSolicitante CSC)</span>
              </label>
              <input {...createForm.register('codigoPessoa')} className="input"
                placeholder="ex: 288319" />
              <p className="text-xs text-muted-foreground mt-1">
                Código de pessoa PUC. Necessário para abrir chamados no CSC automaticamente.
              </p>
              {createForm.formState.errors.codigoPessoa && (
                <p className="error-msg">{createForm.formState.errors.codigoPessoa.message}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button type="button" className="btn-secondary btn-sm" onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary btn-sm"
                disabled={createForm.formState.isSubmitting}>
                {createForm.formState.isSubmitting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Plus className="w-3.5 h-3.5" />}
                Criar usuário
              </button>
            </div>
          </form>
        ) : (
          /* ── Formulário de EDIÇÃO ──────────────────────────────────── */
          <form
            onSubmit={editForm.handleSubmit(onSubmitEdit)}
            className="px-6 py-4 flex flex-col gap-4"
          >
            <div className="form-group">
              <label className="label">Nome <span className="text-red-500">*</span></label>
              <input {...editForm.register('nome')} className="input" />
              {editForm.formState.errors.nome && (
                <p className="error-msg">{editForm.formState.errors.nome.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="label">Email</label>
              <input value={editing.email} className="input" disabled />
              <p className="text-xs text-muted-foreground mt-1">O email não pode ser alterado.</p>
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
                <span className="text-sm text-foreground">Usuário ativo</span>
              </label>
            </div>

            <div className="form-group">
              <label className="label">
                Código PUC
                <span className="text-xs text-muted-foreground font-normal ml-1">(LoginSolicitante CSC)</span>
              </label>
              <input {...editForm.register('codigoPessoa')} className="input"
                placeholder="ex: 288319" />
              <p className="text-xs text-muted-foreground mt-1">
                Código de pessoa PUC usado para abertura automática de chamados no CSC.
              </p>
              {editForm.formState.errors.codigoPessoa && (
                <p className="error-msg">{editForm.formState.errors.codigoPessoa.message}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button type="button" className="btn-secondary btn-sm" onClick={closeModal}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary btn-sm"
                disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Plus className="w-3.5 h-3.5" />}
                Salvar alterações
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Modal negar solicitação de acesso ─────────────────────────── */}
      <Modal
        open={!!negandoId}
        onClose={() => setNegandoId(null)}
        title="Negar solicitação de acesso"
      >
        <div className="px-6 py-4 flex flex-col gap-4">
          <div className="form-group">
            <label className="label">Motivo (opcional)</label>
            <textarea
              className="input"
              rows={3}
              value={motivoNegar}
              onChange={(e) => setMotivoNegar(e.target.value)}
              placeholder="Informe o motivo da recusa..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setNegandoId(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary btn-sm"
              disabled={negarSolicitacao.isPending}
              onClick={confirmarNegar}>
              {negarSolicitacao.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <UserX className="w-3.5 h-3.5" />}
              Negar solicitação
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}