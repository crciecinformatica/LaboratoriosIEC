'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  useReserva,
  useLaboratorios,
  useConfirmReserva,
  useRejectReserva,
  useMarcarConflitoReserva,
  useReagendarReserva,
  useUploadAnexo,
} from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { Modal } from '@/components/ui/modal'
import { HistoricoTimeline } from '@/components/reservas/historico-timeline'
import { statusLabel, statusColor, modalidadeLabel } from '@/types'
import type { StatusReserva } from '@prisma/client'
import {
  ChevronLeft, Loader2, CalendarDays,
  Paperclip, Upload, FileText, Check, X, AlertTriangle,
} from 'lucide-react'

const colorMap: Record<string, string> = {
  gray: 'badge-gray', amber: 'badge-amber', green: 'badge-green',
  red: 'badge-red', coral: 'badge-coral', blue: 'badge-blue',
}

function formatarDia(dia: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(dia))
}

export default function ReservaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session } = useSession()
  const toast = useToast()

  const { data: reserva, isLoading } = useReserva(id)
  const { data: labData }            = useLaboratorios('', 1, 100)
  const confirmar = useConfirmReserva()
  const rejeitar  = useRejectReserva()
  const conflito  = useMarcarConflitoReserva()
  const reagendar = useReagendarReserva()
  const upload    = useUploadAnexo(id)

  const [labId,  setLabId]  = useState('')
  const [motivo, setMotivo] = useState('')
  const [modalConflito, setModalConflito]   = useState(false)
  const [modalReagendar, setModalReagendar] = useState(false)

  // Campos do reagendamento — novo modelo dia/hora
  const [novoDia,        setNovoDia]        = useState('')
  const [novaHoraInicio, setNovaHoraInicio] = useState('')
  const [novaHoraFim,    setNovaHoraFim]    = useState('')

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

  async function confirmarConflito() {
    try {
      await conflito.mutateAsync({ reservaId: id })
      toast.success('Conflito registrado.')
      setModalConflito(false)
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao marcar conflito')
    }
  }

  async function handleReagendar() {
    if (!novoDia || !novaHoraInicio || !novaHoraFim) {
      toast.error('Preencha o dia e os horários.')
      return
    }
    try {
      await reagendar.mutateAsync({
        reservaId: id,
        dia:        novoDia,
        horaInicio: novaHoraInicio,
        horaFim:    novaHoraFim,
      })
      toast.success('Reagendamento realizado!')
      setModalReagendar(false)
      setNovoDia('')
      setNovaHoraInicio('')
      setNovaHoraFim('')
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
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!reserva) {
    return <div className="text-center py-20 text-slate-400">Reserva não encontrada.</div>
  }

  const podeAgir    = isOperador && reserva.status === 'AGUARDANDO_CONFIRMACAO'
  const podeConflito = isOperador && reserva.status === 'AGUARDANDO_CONFIRMACAO'
  const podeCorrigir = reserva.status === 'CONFLITO_DE_DATAS' &&
    (reserva.solicitante.id === session?.user.id ||
      ['ADMINISTRADOR', 'APOIO_ACADEMICO'].includes(session?.user.perfil ?? ''))
  const podeAnexar  = reserva.solicitante.id === session?.user.id || session?.user.perfil === 'ADMINISTRADOR'

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start gap-3">
        <Link href="/reservas" className="btn-ghost btn-sm p-1.5 mt-1">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-900">{reserva.titulo}</h1>
            <span className={`badge ${colorMap[statusColor[reserva.status as StatusReserva]] ?? 'badge-gray'}`}>
              {statusLabel[reserva.status as StatusReserva]}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{reserva.turma.nome} — {reserva.turma.curso}</p>
          <p className="text-xs text-slate-400 mt-1">
            Criada em {new Date(reserva.criadoEm).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dados */}
        <div className="card p-5 lg:col-span-2 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-800">Dados da solicitação</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><p className="text-xs text-slate-400">Modalidade</p><p className="text-slate-700">{modalidadeLabel[reserva.modalidadeReserva as keyof typeof modalidadeLabel] ?? reserva.modalidadeReserva}</p></div>
            <div><p className="text-xs text-slate-400">Professor</p><p className="text-slate-700">{reserva.professor.nome}</p></div>
            <div><p className="text-xs text-slate-400">Cód. pessoa / matrícula</p><p className="text-slate-700">{reserva.professor.matricula ?? '—'}</p></div>
            <div><p className="text-xs text-slate-400">Telefone prof.</p><p className="text-slate-700">{reserva.professor.telefone ?? '—'}</p></div>
            <div><p className="text-xs text-slate-400">Curso</p><p className="text-slate-700">{reserva.turma.curso}</p></div>
            <div><p className="text-xs text-slate-400">Nº oferta / turma</p><p className="text-slate-700">{reserva.turma.numOferta ?? '—'} / {reserva.turma.codigo}</p></div>
            <div><p className="text-xs text-slate-400">Cód. disciplina</p><p className="text-slate-700">{reserva.turma.codigoDisciplina}</p></div>
            <div><p className="text-xs text-slate-400">Disciplina</p><p className="text-slate-700">{reserva.turma.nome}</p></div>
            <div><p className="text-xs text-slate-400">Softwares</p><p className="text-slate-700">{reserva.softwaresUtilizados}</p></div>
            <div><p className="text-xs text-slate-400">Nº alunos</p><p className="text-slate-700">{reserva.numeroAlunos}</p></div>
            <div><p className="text-xs text-slate-400">Solicitante</p><p className="text-slate-700">{reserva.solicitante.nome}</p></div>
            {reserva.laboratorio && (
              <div><p className="text-xs text-slate-400">Laboratório</p><p className="text-slate-700">{reserva.laboratorio.nome}</p></div>
            )}
            {reserva.cscProtocolo && (
              <div>
                <p className="text-xs text-slate-400">Protocolo CSC</p>
                <p className="text-slate-700 font-mono">#{reserva.cscProtocolo}</p>
              </div>
            )}
          </div>

          {/* Horário — campos diretos dia/horaInicio/horaFim */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" /> Horário solicitado
            </h3>
            <div className="text-sm px-3 py-2 rounded-lg bg-slate-50 text-slate-700">
              {formatarDia(reserva.dia)}, {reserva.horaInicio} — {reserva.horaFim}
            </div>
          </div>

          {reserva.motivoRejeicao && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-xs font-medium text-red-700">Motivo da rejeição</p>
              <p className="text-sm text-red-600 mt-0.5">{reserva.motivoRejeicao}</p>
            </div>
          )}
        </div>

        {/* Histórico */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Histórico de tramitação</h2>
          <HistoricoTimeline historico={reserva.historico} />
        </div>
      </div>

      {/* Anexos */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
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
          <p className="text-sm text-slate-400">Nenhum anexo enviado.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reserva.anexos.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition text-sm text-slate-700">
                  <FileText className="w-4 h-4 text-slate-400" />
                  {a.nomeArquivo}
                  <span className="text-xs text-slate-400 ml-auto">{(a.tamanho / 1024).toFixed(0)} KB</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Corrigir conflito — apoio acadêmico propõe novo horário */}
      {podeCorrigir && (
        <div className="card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-800">Corrigir horário em conflito</h2>
          <p className="text-sm text-slate-500">
            O operador identificou um conflito neste horário. Informe uma nova data e horário para análise.
          </p>
          <p className="text-sm px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-red-700">
            Atual: {formatarDia(reserva.dia)}, {reserva.horaInicio} — {reserva.horaFim}
          </p>
          <div className="form-group">
            <label className="label">Nova data</label>
            <input type="date" className="input" value={novoDia} onChange={(e) => setNovoDia(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Novo início</label>
              <input type="time" className="input" value={novaHoraInicio} onChange={(e) => setNovaHoraInicio(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Novo fim</label>
              <input type="time" className="input" value={novaHoraFim} onChange={(e) => setNovaHoraFim(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary btn-sm self-start" onClick={handleReagendar} disabled={reagendar.isPending}>
            {reagendar.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Enviar nova data e retornar para análise
          </button>
        </div>
      )}

      {/* Ações do operador */}
      {podeAgir && (
        <div className="card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-800">Ações do operador</h2>
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

      {/* Modal confirmar conflito */}
      <Modal open={modalConflito} onClose={() => setModalConflito(false)} title="Confirmar conflito de datas" size="sm">
        <div className="px-6 py-4 flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            Confirma que o horário <strong>{formatarDia(reserva.dia)}, {reserva.horaInicio} — {reserva.horaFim}</strong> está em conflito?
          </p>
          <p className="text-xs text-slate-400">
            O solicitante poderá propor um novo horário para análise.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary btn-sm" onClick={() => setModalConflito(false)}>Cancelar</button>
            <button className="btn-primary btn-sm" onClick={confirmarConflito} disabled={conflito.isPending}>
              Confirmar conflito
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal reagendar (operador) */}
      <Modal open={modalReagendar} onClose={() => setModalReagendar(false)} title="Reagendar após conflito" size="sm">
        <div className="px-6 py-4 flex flex-col gap-3">
          <div className="form-group">
            <label className="label">Nova data</label>
            <input type="date" className="input" value={novoDia} onChange={(e) => setNovoDia(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Hora início</label>
              <input type="time" className="input" value={novaHoraInicio} onChange={(e) => setNovaHoraInicio(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Hora fim</label>
              <input type="time" className="input" value={novaHoraFim} onChange={(e) => setNovaHoraFim(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setModalReagendar(false)}>Cancelar</button>
            <button className="btn-primary btn-sm" onClick={handleReagendar} disabled={reagendar.isPending}>Reagendar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}