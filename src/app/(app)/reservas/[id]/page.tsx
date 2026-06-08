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
  useUploadAnexo,
} from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { HistoricoTimeline } from '@/components/reservas/historico-timeline'
import { statusLabel, statusColor } from '@/types'
import type { StatusReserva } from '@prisma/client'
import {
  ChevronLeft, Loader2, CalendarDays, User, BookOpen,
  FlaskConical, Paperclip, Upload, FileText, Check, X, AlertTriangle,
} from 'lucide-react'

const colorMap: Record<string, string> = {
  gray: 'badge-gray', amber: 'badge-amber', green: 'badge-green',
  red: 'badge-red', coral: 'badge-coral', blue: 'badge-blue',
}

export default function ReservaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session } = useSession()
  const toast = useToast()
  const { data: reserva, isLoading } = useReserva(id)
  const { data: labData } = useLaboratorios('', 1, 100)
  const confirmar = useConfirmReserva()
  const rejeitar = useRejectReserva()
  const conflito = useMarcarConflitoReserva()
  const upload = useUploadAnexo(id)

  const [labId, setLabId] = useState('')
  const [motivo, setMotivo] = useState('')

  const isOperador = ['OPERADOR_TI', 'ADMINISTRADOR'].includes(session?.user.perfil ?? '')
  const laboratorios = labData?.laboratorios ?? []

  async function handleConfirmar() {
    if (!labId) { toast.error('Selecione um laboratório.'); return }
    try {
      await confirmar.mutateAsync({ reservaId: id, laboratorioId: labId })
      toast.success('Reserva confirmada!')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao confirmar'
      toast.error(msg)
    }
  }

  async function handleRejeitar() {
    if (motivo.length < 10) { toast.error('Informe o motivo com ao menos 10 caracteres.'); return }
    try {
      await rejeitar.mutateAsync({ reservaId: id, motivoRejeicao: motivo })
      toast.success('Reserva rejeitada.')
      setMotivo('')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao rejeitar'
      toast.error(msg)
    }
  }

  async function handleConflito() {
    try {
      await conflito.mutateAsync(id)
      toast.success('Conflito registrado.')
    } catch {
      toast.error('Erro ao marcar conflito.')
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await upload.mutateAsync(file)
      toast.success('Anexo enviado!')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro no upload'
      toast.error(msg)
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
    return (
      <div className="text-center py-20 text-slate-400">
        Reserva não encontrada.
      </div>
    )
  }

  const podeAgir = isOperador && reserva.status === 'AGUARDANDO_CONFIRMACAO'
  const podeAnexar = reserva.solicitante.id === session?.user.id || session?.user.perfil === 'ADMINISTRADOR'

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
          {reserva.descricao && (
            <p className="text-sm text-slate-500 mt-1">{reserva.descricao}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">
            Criada em {new Date(reserva.criadoEm).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dados */}
        <div className="card p-5 lg:col-span-2 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-800">Dados da solicitação</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">Professor</p>
                <p className="text-slate-700">{reserva.professor.nome}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">Turma</p>
                <p className="text-slate-700">{reserva.turma.codigo} — {reserva.turma.nome}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">Solicitante</p>
                <p className="text-slate-700">{reserva.solicitante.nome}</p>
              </div>
            </div>
            {reserva.laboratorio && (
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">Laboratório</p>
                  <p className="text-slate-700">{reserva.laboratorio.nome}</p>
                </div>
              </div>
            )}
          </div>

          {/* Horários */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" /> Horários solicitados
            </h3>
            <ul className="flex flex-col gap-1.5">
              {reserva.datas.map((d) => (
                <li key={d.id} className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">
                  {new Date(d.dataInicio).toLocaleString('pt-BR')} — {new Date(d.dataFim).toLocaleString('pt-BR')}
                  {d.recorrente && <span className="ml-2 badge badge-blue text-[10px]">Recorrente</span>}
                </li>
              ))}
            </ul>
          </div>

          {reserva.motivoRejeicao && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-xs font-medium text-red-700">Motivo da rejeição</p>
              <p className="text-sm text-red-600 mt-0.5">{reserva.motivoRejeicao}</p>
            </div>
          )}
        </div>

        {/* Histórico (RF11) */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Histórico de tramitação</h2>
          <HistoricoTimeline historico={reserva.historico} />
        </div>
      </div>

      {/* Anexos (RF12) */}
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
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition text-sm text-slate-700"
                >
                  <FileText className="w-4 h-4 text-slate-400" />
                  {a.nomeArquivo}
                  <span className="text-xs text-slate-400 ml-auto">
                    {(a.tamanho / 1024).toFixed(0)} KB
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

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
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" onClick={handleConflito} disabled={conflito.isPending}>
              <AlertTriangle className="w-3.5 h-3.5" /> Marcar conflito
            </button>
          </div>
          <div className="form-group">
            <label className="label">Motivo da rejeição</label>
            <textarea
              className="input min-h-[60px]"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo (mín. 10 caracteres)..."
            />
          </div>
          <button className="btn-danger btn-sm self-start" onClick={handleRejeitar} disabled={rejeitar.isPending}>
            <X className="w-3.5 h-3.5" /> Rejeitar
          </button>
        </div>
      )}
    </div>
  )
}
