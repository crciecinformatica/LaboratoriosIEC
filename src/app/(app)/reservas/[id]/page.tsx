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
  useCorrigirConflito,
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

export default function ReservaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session } = useSession()
  const toast = useToast()
  const { data: reserva, isLoading } = useReserva(id)
  const { data: labData } = useLaboratorios('', 1, 100)
  const confirmar = useConfirmReserva()
  const rejeitar = useRejectReserva()
  const conflito = useMarcarConflitoReserva()
  const corrigir = useCorrigirConflito()
  const upload = useUploadAnexo(id)

  const [labId, setLabId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [modalConflito, setModalConflito] = useState(false)
  const [datasConflito, setDatasConflito] = useState<string[]>([])
  const [correcoes, setCorrecoes] = useState<Record<string, { inicio: string; fim: string }>>({})

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

  function abrirModalConflito() {
    if (!reserva) return
    setDatasConflito(reserva.datas.length === 1 ? [reserva.datas[0].id] : [])
    setModalConflito(true)
  }

  async function confirmarConflito() {
    if (datasConflito.length === 0) {
      toast.error('Selecione ao menos uma data em conflito.')
      return
    }
    try {
      await conflito.mutateAsync({ reservaId: id, dataHorarioIds: datasConflito })
      toast.success('Conflito registrado. O apoio acadêmico poderá corrigir as datas.')
      setModalConflito(false)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao marcar conflito'
      toast.error(msg)
    }
  }

  async function handleCorrigirConflitos() {
    const datasEmConflito = reserva?.datas.filter((d) => d.emConflito) ?? []
    const correcoesPayload = datasEmConflito.map((d) => {
      const c = correcoes[d.id]
      if (!c?.inicio || !c?.fim) return null
      return {
        dataHorarioId: d.id,
        dataInicio: new Date(c.inicio).toISOString(),
        dataFim: new Date(c.fim).toISOString(),
      }
    }).filter(Boolean) as { dataHorarioId: string; dataInicio: string; dataFim: string }[]

    if (correcoesPayload.length === 0) {
      toast.error('Preencha as novas datas para os horários em conflito.')
      return
    }

    try {
      await corrigir.mutateAsync({ reservaId: id, correcoes: correcoesPayload })
      toast.success('Datas corrigidas! A solicitação retornou para aguardando confirmação.')
      setCorrecoes({})
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao corrigir'
      toast.error(msg)
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
  const podeCorrigir = reserva.status === 'CONFLITO_DE_DATAS' &&
    (reserva.solicitante.id === session?.user.id ||
      ['ADMINISTRADOR', 'APOIO_ACADEMICO'].includes(session?.user.perfil ?? ''))
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
          </div>

          {/* Horários */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" /> Horários solicitados
            </h3>
            <ul className="flex flex-col gap-1.5">
              {reserva.datas.map((d) => (
                <li key={d.id} className={`text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${d.emConflito ? 'bg-red-50 text-red-800 border border-red-100' : 'bg-slate-50 text-slate-700'}`}>
                  {new Date(d.dataInicio).toLocaleString('pt-BR')} — {new Date(d.dataFim).toLocaleString('pt-BR')}
                  {d.emConflito && <span className="badge badge-red text-[10px]">Em conflito</span>}
                  {d.recorrente && <span className="badge badge-blue text-[10px]">Recorrente</span>}
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

      {podeCorrigir && (
        <div className="card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-800">Corrigir datas em conflito</h2>
          <p className="text-sm text-slate-500">Informe novos horários apenas para as datas marcadas em conflito pelo operador.</p>
          {reserva.datas.filter((d) => d.emConflito).map((d) => (
            <div key={d.id} className="p-3 border border-red-100 rounded-lg flex flex-col gap-2">
              <p className="text-xs text-red-600 font-medium">
                Conflito: {new Date(d.dataInicio).toLocaleString('pt-BR')} — {new Date(d.dataFim).toLocaleString('pt-BR')}
              </p>
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Novo início</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={correcoes[d.id]?.inicio ?? ''}
                    onChange={(e) => setCorrecoes((p) => ({ ...p, [d.id]: { ...p[d.id], inicio: e.target.value, fim: p[d.id]?.fim ?? '' } }))}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Novo fim</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={correcoes[d.id]?.fim ?? ''}
                    onChange={(e) => setCorrecoes((p) => ({ ...p, [d.id]: { inicio: p[d.id]?.inicio ?? '', fim: e.target.value } }))}
                  />
                </div>
              </div>
            </div>
          ))}
          <button className="btn-primary btn-sm self-start" onClick={handleCorrigirConflitos} disabled={corrigir.isPending}>
            Enviar correções e retornar para análise
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
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" onClick={abrirModalConflito} disabled={conflito.isPending}>
              <AlertTriangle className="w-3.5 h-3.5" /> Marcar conflito de datas
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
      <Modal open={modalConflito} onClose={() => setModalConflito(false)} title="Selecionar datas em conflito" size="sm">
        <div className="px-6 py-4 flex flex-col gap-3">
          <p className="text-sm text-slate-600">Marque quais horários possuem conflito de agenda.</p>
          {reserva.datas.map((d) => (
            <label key={d.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded"
                checked={datasConflito.includes(d.id)}
                onChange={(e) => {
                  setDatasConflito((prev) =>
                    e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)
                  )
                }}
              />
              <span className="text-sm text-slate-700">
                {new Date(d.dataInicio).toLocaleString('pt-BR')} — {new Date(d.dataFim).toLocaleString('pt-BR')}
              </span>
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary btn-sm" onClick={() => setModalConflito(false)}>Cancelar</button>
            <button className="btn-primary btn-sm" onClick={confirmarConflito} disabled={conflito.isPending}>
              Confirmar conflito
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
