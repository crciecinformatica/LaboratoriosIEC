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
import { Plus, Pencil, Trash2, FlaskConical, Loader2, CalendarCheck2, CalendarX2 } from 'lucide-react'
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
  const [softwaresInput, setSoftwaresInput] = useState('')

  const { data, isLoading } = useLaboratorios(search, page)
  const criar = useCreateLaboratorio()
  const excluir = useDeleteLaboratorio()
  const toast = useToast()

  const labs = data?.laboratorios ?? []
  const total = data?.total ?? 0
  const limit = data?.limit ?? 20

  const podeEditar = ['OPERADOR_TI', 'ADMINISTRADOR'].includes(session?.user.perfil ?? '')
  const colSpan = podeEditar ? 9 : 8

  const atualizar = useUpdateLaboratorio(editing?.id ?? '')

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LaboratorioFormInput>({
    resolver: zodResolver(criarLaboratorioSchema),
    defaultValues: { recursos: [], softwares: [] },
  })

  function openCreate() {
    setEditing(null)
    setRecursosInput('')
    setSoftwaresInput('')
    reset({ recursos: [], softwares: [], googleCalendarId: '' })
    setModalOpen(true)
  }

  function openEdit(lab: Laboratorio) {
    setEditing(lab)
    setRecursosInput(lab.recursos.join(', '))
    setSoftwaresInput(lab.softwares ? lab.softwares.join(', ') : '')
    reset({
      nome: lab.nome,
      codigo: lab.codigo,
      capacidade: lab.capacidade,
      recursos: lab.recursos,
      softwares: lab.softwares ?? [],
      localizacao: lab.localizacao ?? undefined,
      googleCalendarId: lab.googleCalendarId ?? '',
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setRecursosInput('')
    reset({ recursos: [], googleCalendarId: '' })
  }

  async function onSubmit(formData: LaboratorioFormInput) {
    const payload = {
      ...formData,
      recursos: formData.recursos ?? [],
      // String vazia → undefined, para não gravar "" no banco quando o campo
      // for deixado em branco (mantém null/undefined em vez de string vazia)
      googleCalendarId: formData.googleCalendarId?.trim() || undefined,
    }
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
    <div className="flex flex-col gap-6 max-w-6xl">
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
                <th>Softwares</th>
                <th>Google Calendar</th>
                <th>Status</th>
                {podeEditar && <th className="text-right">Ações</th>}
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
              {!isLoading && labs.length === 0 && (
                <EmptyState message="Nenhum laboratório encontrado." colSpan={colSpan} />
              )}
              {labs.map((lab) => (
                <tr key={lab.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FlaskConical className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="font-medium text-foreground">{lab.nome}</span>
                    </div>
                  </td>
                  <td><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{lab.codigo}</code></td>
                  <td>{lab.capacidade} lugares</td>
                  <td className="text-muted-foreground">{lab.localizacao ?? '—'}</td>
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
                    <div className="flex flex-wrap gap-1">
                      {(lab.softwares || []).slice(0, 3).map((s) => (
                        <span key={s} className="badge badge-blue text-[10px] bg-indigo-50 text-indigo-700 ring-indigo-600/20">{s}</span>
                      ))}
                      {(lab.softwares || []).length > 3 && (
                        <span className="badge badge-gray text-[10px]">+{(lab.softwares || []).length - 3}</span>
                      )}
                      {!(lab.softwares || []).length && <span className="text-muted-foreground text-xs">—</span>}
                    </div>
                  </td>
                  <td>
                    {lab.googleCalendarId ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-[var(--color-success)] bg-[var(--color-success-bg)] px-1.5 py-0.5 rounded"
                        title={lab.googleCalendarId}
                      >
                        <CalendarCheck2 className="w-3 h-3" /> Vinculada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        <CalendarX2 className="w-3 h-3" /> Sem agenda
                      </span>
                    )}
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
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 flex flex-col gap-4">
          <div className="form-row">
            <div className="form-group">
              <label className="label">Nome <span className="text-red-500">*</span></label>
              <input {...register('nome')} className="input" placeholder="Prédio 1 - Lab 505" />
              {errors.nome && <p className="error-msg">{errors.nome.message}</p>}
            </div>
            <div className="form-group">
              <label className="label">Código <span className="text-red-500">*</span></label>
              <input {...register('codigo')} className="input" placeholder="P1-LAB505" />
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
              <input {...register('localizacao')} className="input" placeholder="Prédio 1" />
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

          <div className="form-group">
            <label className="label">Softwares (separados por vírgula)</label>
            <input
              className="input"
              placeholder="Python, AutoCAD, Excel"
              value={softwaresInput}
              onChange={(e) => {
                setSoftwaresInput(e.target.value)
                const val = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                setValue('softwares', val, { shouldValidate: true })
              }}
            />
          </div>

          <div className="form-group">
            <label className="label">ID da agenda do Google Calendar</label>
            <input
              {...register('googleCalendarId')}
              className="input font-mono text-xs"
              placeholder="abc123def456@group.calendar.google.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Opcional. Encontre em Google Calendar → ⋮ na agenda do laboratório
              → Configurações e compartilhamento → Integrar agenda → ID da agenda.
              Deixe em branco se este laboratório ainda não tem uma agenda própria
              — ele não terá eventos criados/atualizados/removidos no Calendar
              até que esse campo seja preenchido.
            </p>
            {errors.googleCalendarId && <p className="error-msg">{errors.googleCalendarId.message}</p>}
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
              {editing ? 'Salvar alterações' : 'Criar laboratório'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}