'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  useReserva,
  useLaboratorios,
  useConfirmReserva,
  useRejectReserva,
  useReagendarReserva,
  useUploadAnexo,
  useIntegracoesReserva,
  type DataHorario,
} from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { Modal } from '@/components/ui/modal'
import { HistoricoTimeline } from '@/components/reservas/historico-timeline'
import { MarcarConflitoDialog } from '@/components/reservas/marcar-conflito-dialog'
import { statusLabel, statusColor, modalidadeLabel } from '@/types'
import type { StatusReserva } from '@prisma/client'
import {
  ChevronLeft, Loader2, CalendarDays,
  Paperclip, Upload, FileText, Check, X, AlertTriangle, Plus, Trash2, RefreshCw,
} from 'lucide-react'

const colorMap: Record<string, string> = {
  gray: 'badge-gray', amber: 'badge-amber', green: 'badge-green',
  red: 'badge-red', coral: 'badge-coral', blue: 'badge-blue',
}

function formatarDia(iso: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso))
}

// ─── Sub-componente: lista de datas da reserva ────────────────────────────────

function ListaDatas({ datas }: { datas: DataHorario[] }) {
  if (datas.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma data cadastrada.</p>

  return (
    <ul className="flex flex-col gap-1.5">
      {datas.map((d) => (
        <li
          key={d.id}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
            d.emConflito
              ? 'bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)]'
              : 'bg-muted'
          }`}
        >
          <CalendarDays className={`w-3.5 h-3.5 shrink-0 ${
            d.emConflito ? 'text-[var(--color-danger)]' : 'text-muted-foreground'
          }`} />
          <span className={`font-medium ${
            d.emConflito ? 'text-[var(--color-danger)]' : 'text-foreground'
          }`}>
            {formatarDia(d.dia)}
          </span>
          <span className={d.emConflito ? 'text-[var(--color-danger)]' : 'text-muted-foreground'}>
            {d.horaInicio} — {d.horaFim}
          </span>
          {d.recorrente && (
            <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              recorrente
            </span>
          )}
          {d.emConflito && (
            <span className="ml-auto text-[10px] font-medium text-[var(--color-danger)] bg-[var(--color-danger-bg)] px-1.5 py-0.5 rounded">
              conflito
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

// ─── Sub-componente: editor de múltiplas datas para reagendamento ─────────────

type DataForm = { dia: string; horaInicio: string; horaFim: string }

function EditorDatas({
  value,
  onChange,
}: {
  value: DataForm[]
  onChange: (datas: DataForm[]) => void
}) {
  function add() {
    onChange([...value, { dia: '', horaInicio: '', horaFim: '' }])
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  function update(i: number, field: keyof DataForm, val: string) {
    onChange(value.map((d, idx) => (idx === i ? { ...d, [field]: val } : d)))
  }

  return (
    <div className="flex flex-col gap-2">
      {value.map((d, i) => (
        <div key={i} className="flex items-end gap-2 flex-wrap">
          <div className="form-group flex-1 min-w-[130px]">
            {i === 0 && <label className="label">Data</label>}
            <input
              type="date"
              className="input"
              value={d.dia}
              onChange={(e) => update(i, 'dia', e.target.value)}
            />
          </div>
          <div className="form-group">
            {i === 0 && <label className="label">Início</label>}
            <input
              type="time"
              className="input"
              value={d.horaInicio}
              onChange={(e) => update(i, 'horaInicio', e.target.value)}
            />
          </div>
          <div className="form-group">
            {i === 0 && <label className="label">Fim</label>}
            <input
              type="time"
              className="input"
              value={d.horaFim}
              onChange={(e) => update(i, 'horaFim', e.target.value)}
            />
          </div>
          {value.length > 1 && (
            <button
              type="button"
              className="btn-ghost btn-sm p-1.5 text-[var(--color-danger)] self-end mb-0.5"
              onClick={() => remove(i)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className="btn-secondary btn-sm self-start" onClick={add}>
        <Plus className="w-3.5 h-3.5" /> Adicionar data
      </button>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ReservaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session } = useSession()
  const toast = useToast()

  const { data: reserva, isLoading } = useReserva(id)
  const { data: labData }            = useLaboratorios('', 1, 100)
  const confirmar = useConfirmReserva()
  const rejeitar  = useRejectReserva()
  const reagendar = useReagendarReserva()
  const upload    = useUploadAnexo(id)
  const integracoes = useIntegracoesReserva()

  const [labId,  setLabId]  = useState('')
  const [motivo, setMotivo] = useState('')
  const [modalConflito,  setModalConflito]  = useState(false)
  const [modalReagendar, setModalReagendar] = useState(false)

  const [novasDatas, setNovasDatas] = useState<DataForm[]>([
    { dia: '', horaInicio: '', horaFim: '' },
  ])

  const isOperador  = ['OPERADOR_TI', 'ADMINISTRADOR'].includes(session?.user.perfil ?? '')
  const laboratorios = labData?.laboratorios ?? []

  async function handleConfirmar() {
    if (!labId) { toast.error('Selecione um laboratório.'); return }
    try {
      await confirmar.mutateAsync({ reservaId: id, laboratorioId: labId })
      toast.success('Reserva confirmada!')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao confirmar')
    }
  }

  async function handleIntegracoes() {
    try {
      await integracoes.mutateAsync(id)
      toast.success('Chamado CSC e integração Teams acionados!')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao acionar integrações')
    }
  }

  async function handleRejeitar() {
    if (motivo.length < 10) { toast.error('Informe o motivo com ao menos 10 caracteres.'); return }
    try {
      await rejeitar.mutateAsync({ reservaId: id, motivoRejeicao: motivo })
      toast.success('Reserva rejeitada.')
      setMotivo('')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao rejeitar')
    }
  }

  async function handleReagendar() {
    const invalidas = novasDatas.filter((d) => !d.dia || !d.horaInicio || !d.horaFim)
    if (invalidas.length > 0) {
      toast.error('Preencha todos os campos de data e horário.')
      return
    }
    try {
      await reagendar.mutateAsync({ reservaId: id, datas: novasDatas })
      toast.success('Reagendamento realizado!')
      setModalReagendar(false)
      setNovasDatas([{ dia: '', horaInicio: '', horaFim: '' }])
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao reagendar')
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await upload.mutateAsync(file)
      toast.success('Anexo enviado!')
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro no upload')
    }
    e.target.value = ''
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!reserva) {
    return <div className="text-center py-20 text-muted-foreground">Reserva não encontrada.</div>
  }

  const podeAgir     = isOperador && reserva.status === 'AGUARDANDO_CONFIRMACAO'
  const podeConflito = isOperador && reserva.status === 'AGUARDANDO_CONFIRMACAO'
  const podeCorrigir = reserva.status === 'CONFLITO_DE_DATAS' &&
    (reserva.solicitante?.id === session?.user.id ||
      ['ADMINISTRADOR', 'APOIO_ACADEMICO'].includes(session?.user.perfil ?? ''))
  const podeAnexar = reserva.solicitante?.id === session?.user.id || session?.user.perfil === 'ADMINISTRADOR'

  const datasEmConflito = reserva.datas.filter((d) => d.emConflito)

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start gap-3">
        <Link href="/reservas" className="btn-ghost btn-sm p-1.5 mt-1">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-foreground">{reserva.titulo}</h1>
            <span className={`badge ${colorMap[statusColor[reserva.status as StatusReserva]] ?? 'badge-gray'}`}>
              {statusLabel[reserva.status as StatusReserva]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{reserva.turma.nome} — {reserva.turma.curso}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Criada em {new Date(reserva.criadoEm).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dados */}
        <div className="card p-5 lg:col-span-2 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">Dados da solicitação</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Modalidade</p><p className="text-foreground">{modalidadeLabel[reserva.modalidadeReserva as keyof typeof modalidadeLabel] ?? reserva.modalidadeReserva}</p></div>
            <div><p className="text-xs text-muted-foreground">Professor</p><p className="text-foreground">{reserva.professor.nome}</p></div>
            <div><p className="text-xs text-muted-foreground">Cód. pessoa / matrícula</p><p className="text-foreground">{reserva.professor.matricula ?? '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Telefone prof.</p><p className="text-foreground">{reserva.professor.telefone ?? '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Curso</p><p className="text-foreground">{reserva.turma.curso}</p></div>
            <div><p className="text-xs text-muted-foreground">Nº oferta / turma</p><p className="text-foreground">{reserva.turma.numOferta ?? '—'} / {reserva.turma.codigo}</p></div>
            <div><p className="text-xs text-muted-foreground">Cód. disciplina</p><p className="text-foreground">{reserva.turma.codigoDisciplina}</p></div>
            <div><p className="text-xs text-muted-foreground">Disciplina</p><p className="text-foreground">{reserva.turma.nome}</p></div>
            <div><p className="text-xs text-muted-foreground">Softwares</p><p className="text-foreground">{reserva.softwaresUtilizados}</p></div>
            <div><p className="text-xs text-muted-foreground">Nº alunos</p><p className="text-foreground">{reserva.numeroAlunos}</p></div>
            <div><p className="text-xs text-muted-foreground">Solicitante</p><p className="text-foreground">{reserva.solicitante.nome}</p></div>
            {reserva.laboratorio && (
              <div><p className="text-xs text-muted-foreground">Laboratório</p><p className="text-foreground">{reserva.laboratorio.nome}</p></div>
            )}
            {reserva.cscProtocolo && (
              <div>
                <p className="text-xs text-muted-foreground">Protocolo CSC</p>
                <p className="text-foreground font-mono">#{reserva.cscProtocolo}</p>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" /> Datas solicitadas
            </h3>
            <ListaDatas datas={reserva.datas} />
          </div>

          {reserva.motivoRejeicao && (
            <div className="p-3 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-lg">
              <p className="text-xs font-medium text-[var(--color-danger)]">Motivo da rejeição</p>
              <p className="text-sm text-[var(--color-danger)] mt-0.5">{reserva.motivoRejeicao}</p>
            </div>
          )}
        </div>

        {/* Histórico */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Histórico de tramitação</h2>
          <HistoricoTimeline historico={reserva.historico} />
        </div>
      </div>

      {/* Anexos */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Paperclip className="w-4 h-4" /> Anexos
          </h2>
          {podeAnexar && (
            <label className="btn-secondary btn-sm cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Enviar arquivo
              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={handleUpload} />
            </label>
          )}
        </div>
        {reserva.anexos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum anexo enviado.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reserva.anexos.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg hover:bg-accent transition text-sm text-foreground">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  {a.nomeArquivo}
                  <span className="text-xs text-muted-foreground ml-auto">{(a.tamanho / 1024).toFixed(0)} KB</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Corrigir conflito */}
      {podeCorrigir && (
        <div className="card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">Corrigir horários em conflito</h2>
          <p className="text-sm text-muted-foreground">
            O operador identificou conflito(s) nas datas abaixo. Informe novas datas e horários para análise.
          </p>
          {datasEmConflito.length > 0 && (
            <div className="flex flex-col gap-1">
              {datasEmConflito.map((d) => (
                <p key={d.id} className="text-sm px-3 py-2 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-lg text-[var(--color-danger)]">
                  Conflito: {formatarDia(d.dia)}, {d.horaInicio} — {d.horaFim}
                </p>
              ))}
            </div>
          )}
          <EditorDatas value={novasDatas} onChange={setNovasDatas} />
          <button
            className="btn-primary btn-sm self-start"
            onClick={handleReagendar}
            disabled={reagendar.isPending}
          >
            {reagendar.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Enviar novas datas e retornar para análise
          </button>
        </div>
      )}

      {/* Ações do operador */}
      {podeAgir && (
        <div className="card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-foreground">Ações do operador</h2>
          <div className="form-row">
            <div className="form-group flex-1">
              <label className="label">Laboratório para confirmação</label>
              <select className="input" value={labId} onChange={(e) => setLabId(e.target.value)}>
                <option value="">Selecione</option>
                {laboratorios.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome} ({l.codigo})</option>
                ))}
              </select>
            </div>
            <button className="btn-primary btn-sm self-end" onClick={handleConfirmar} disabled={confirmar.isPending}>
              <Check className="w-3.5 h-3.5" /> Confirmar
            </button>
          </div>
          {podeConflito && (
            <div>
              <button className="btn-secondary btn-sm" onClick={() => setModalConflito(true)}>
                <AlertTriangle className="w-3.5 h-3.5" /> Marcar conflito de datas
              </button>
            </div>
          )}
          <div className="form-group">
            <label className="label">Motivo da rejeição</label>
            <textarea className="input min-h-[60px]" value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo (mín. 10 caracteres)..." />
          </div>
          <button className="btn-danger btn-sm self-start" onClick={handleRejeitar} disabled={rejeitar.isPending}>
            <X className="w-3.5 h-3.5" /> Rejeitar
          </button>
        </div>
      )}

      {podeAgir && (
        <div className="flex flex-col gap-4 p-5 border rounded-lg bg-card mt-6">
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold text-foreground text-sm">Integrações de Sistema</h3>
            {!reserva.cscProtocolo ? (
              <button 
                className="btn-primary btn-sm self-start" 
                onClick={handleIntegracoes} 
                disabled={integracoes.isPending}
              >
                {integracoes.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <RefreshCw className="w-3.5 h-3.5" />}
                Registrar Chamado CSC e Teams
              </button>
            ) : (
              <p className="text-sm text-green-600 font-medium">Integrações concluídas (Protocolo: {reserva.cscProtocolo})</p>
            )}
          </div>
        </div>
      )}

      <MarcarConflitoDialog
        open={modalConflito}
        onClose={() => setModalConflito(false)}
        reservaId={id}
        datas={reserva.datas}
        onSucesso={() => setModalConflito(false)}
      />

      <Modal open={modalReagendar} onClose={() => setModalReagendar(false)} title="Reagendar após conflito" size="md">
        <div className="px-6 py-4 flex flex-col gap-4">
          <EditorDatas value={novasDatas} onChange={setNovasDatas} />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setModalReagendar(false)}>Cancelar</button>
            <button className="btn-primary btn-sm" onClick={handleReagendar} disabled={reagendar.isPending}>
              Reagendar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}