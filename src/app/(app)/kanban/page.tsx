'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  DndContext, DragOverlay, closestCorners,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  useKanbanReservas, useLaboratorios,
  useConfirmReserva, useRejectReserva,
  useMarcarConflitoReserva, useReagendarReserva,
  type KanbanCard,
} from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { Modal } from '@/components/ui/modal'
import { statusLabel, statusColor, transicaoValida } from '@/types'
import type { StatusReserva } from '@prisma/client'
import { Loader2, GripVertical } from 'lucide-react'

const COLUNAS: StatusReserva[] = [
  'AGUARDANDO_CONFIRMACAO',
  'CONFIRMADA',
  'CONFLITO_DE_DATAS',
  'REJEITADA',
]

const colorMap: Record<string, string> = {
  gray: 'border-slate-200', amber: 'border-amber-200', green: 'border-green-200',
  red: 'border-red-200', coral: 'border-orange-200',
}

function formatarDia(dia: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(dia))
}

function KanbanCardItem({ card }: { card: KanbanCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card } })
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      className={`bg-white rounded-lg border p-3 shadow-sm cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <Link href={`/reservas/${card.id}`}
            className="text-sm font-medium text-slate-800 hover:text-blue-600 line-clamp-2"
            onClick={(e) => e.stopPropagation()}>
            {card.titulo}
          </Link>
          <p className="text-xs text-slate-500 mt-1">{card.professor.nome}</p>
          <p className="text-xs text-slate-400">{card.turma.codigo}</p>
          {/* dia/horaInicio diretos no card */}
          <p className="text-[10px] text-slate-400 mt-1">
            {formatarDia(card.dia)}, {card.horaInicio} — {card.horaFim}
          </p>
        </div>
      </div>
    </div>
  )
}

function KanbanColumn({ status, cards }: { status: StatusReserva; cards: KanbanCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const border = colorMap[statusColor[status]] ?? 'border-slate-200'

  return (
    <div className={`flex flex-col min-w-[260px] flex-1 rounded-xl border-2 ${border} ${isOver ? 'bg-blue-50/50' : 'bg-slate-50/50'}`}>
      <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{statusLabel[status]}</span>
        <span className="text-xs text-slate-400 bg-white px-1.5 py-0.5 rounded-full border">{cards.length}</span>
      </div>
      <div ref={setNodeRef} className="flex flex-col gap-2 p-2 min-h-[200px] flex-1">
        {cards.map((card) => (
          <KanbanCardItem key={card.id} card={card} />
        ))}
      </div>
    </div>
  )
}

export function ReservasKanban() {
  const { data, isLoading, refetch } = useKanbanReservas()
  const { data: labData }            = useLaboratorios('', 1, 100)
  const confirmar = useConfirmReserva()
  const rejeitar  = useRejectReserva()
  const conflito  = useMarcarConflitoReserva()
  const reagendar = useReagendarReserva()
  const toast     = useToast()

  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)
  const [modal,   setModal]   = useState<'confirmar' | 'rejeitar' | 'reagendar' | 'conflito' | null>(null)
  const [pending, setPending] = useState<{ cardId: string; targetStatus: StatusReserva } | null>(null)
  const [labId,  setLabId]  = useState('')
  const [motivo, setMotivo] = useState('')
  // Reagendar — novo modelo dia/hora separados
  const [reagendarDia,        setReagendarDia]        = useState('')
  const [reagendarHoraInicio, setReagendarHoraInicio] = useState('')
  const [reagendarHoraFim,    setReagendarHoraFim]    = useState('')

  const sensors     = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const laboratorios = labData?.laboratorios ?? []

  function findCard(id: string): KanbanCard | undefined {
    return data?.colunas.flatMap((c) => c.reservas).find((r) => r.id === id)
  }

  function handleDragStart(e: DragStartEvent) {
    const card = findCard(String(e.active.id))
    if (card) setActiveCard(card)
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveCard(null)
    const cardId       = String(e.active.id)
    const targetStatus = String(e.over?.id) as StatusReserva
    const card         = findCard(cardId)
    if (!card || !targetStatus || card.status === targetStatus) return

    if (!transicaoValida(card.status as StatusReserva, targetStatus)) {
      toast.error(`Transição inválida: ${statusLabel[card.status as StatusReserva]} → ${statusLabel[targetStatus]}`)
      return
    }

    setPending({ cardId, targetStatus })

    if      (targetStatus === 'CONFIRMADA')          setModal('confirmar')
    else if (targetStatus === 'REJEITADA')           setModal('rejeitar')
    else if (targetStatus === 'CONFLITO_DE_DATAS')   setModal('conflito')
    else if (targetStatus === 'AGUARDANDO_CONFIRMACAO') setModal('reagendar')
  }

  async function submitConflito() {
    if (!pending) return
    try {
      await conflito.mutateAsync({ reservaId: pending.cardId })
      toast.success('Conflito registrado.')
      closeModal(); refetch()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro')
    }
  }

  async function submitConfirmar() {
    if (!pending || !labId) { toast.error('Selecione um laboratório.'); return }
    try {
      await confirmar.mutateAsync({ reservaId: pending.cardId, laboratorioId: labId })
      toast.success('Reserva confirmada!')
      closeModal(); refetch()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro')
    }
  }

  async function submitRejeitar() {
    if (!pending || motivo.length < 10) { toast.error('Motivo com ao menos 10 caracteres.'); return }
    try {
      await rejeitar.mutateAsync({ reservaId: pending.cardId, motivoRejeicao: motivo })
      toast.success('Reserva rejeitada.')
      closeModal(); refetch()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro')
    }
  }

  async function submitReagendar() {
    if (!pending || !reagendarDia || !reagendarHoraInicio || !reagendarHoraFim) {
      toast.error('Preencha a data e os horários.')
      return
    }
    try {
      await reagendar.mutateAsync({
        reservaId:  pending.cardId,
        dia:        reagendarDia,
        horaInicio: reagendarHoraInicio,
        horaFim:    reagendarHoraFim,
      })
      toast.success('Reagendamento realizado!')
      closeModal(); refetch()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro')
    }
  }

  function closeModal() {
    setModal(null); setPending(null)
    setLabId(''); setMotivo('')
    setReagendarDia(''); setReagendarHoraInicio(''); setReagendarHoraFim('')
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
  }

  const colunas = data?.colunas ?? COLUNAS.map((s) => ({ status: s, reservas: [] }))

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {colunas.map((col) => (
            <KanbanColumn key={col.status} status={col.status as StatusReserva} cards={col.reservas} />
          ))}
        </div>
        <DragOverlay>
          {activeCard && (
            <div className="bg-white rounded-lg border p-3 shadow-lg w-[240px] opacity-90">
              <p className="text-sm font-medium">{activeCard.titulo}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Modal open={modal === 'confirmar'} onClose={closeModal} title="Confirmar reserva" size="sm">
        <div className="px-6 py-4 flex flex-col gap-3">
          <p className="text-sm text-slate-600">Selecione o laboratório para vincular à reserva.</p>
          <select className="input" value={labId} onChange={(e) => setLabId(e.target.value)}>
            <option value="">Selecione o laboratório</option>
            {laboratorios.map((l) => (
              <option key={l.id} value={l.id}>{l.nome} ({l.codigo})</option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={closeModal}>Cancelar</button>
            <button className="btn-primary btn-sm" onClick={submitConfirmar} disabled={confirmar.isPending}>Confirmar</button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'rejeitar'} onClose={closeModal} title="Rejeitar reserva" size="sm">
        <div className="px-6 py-4 flex flex-col gap-3">
          <textarea className="input min-h-[80px]" value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo da rejeição (mín. 10 caracteres)..." />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={closeModal}>Cancelar</button>
            <button className="btn-danger btn-sm" onClick={submitRejeitar} disabled={rejeitar.isPending}>Rejeitar</button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'conflito'} onClose={closeModal} title="Marcar conflito de datas" size="sm">
        <div className="px-6 py-4 flex flex-col gap-3">
          <p className="text-sm text-slate-600">Confirma que este horário está em conflito?</p>
          <p className="text-xs text-slate-400">O solicitante será notificado e poderá propor um novo horário.</p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={closeModal}>Cancelar</button>
            <button className="btn-primary btn-sm" onClick={submitConflito} disabled={conflito.isPending}>Confirmar conflito</button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === 'reagendar'} onClose={closeModal} title="Reagendar após conflito" size="sm">
        <div className="px-6 py-4 flex flex-col gap-4">
          <div className="form-group">
            <label className="label">Nova data</label>
            <input type="date" className="input" value={reagendarDia}
              onChange={(e) => setReagendarDia(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Hora início</label>
              <input type="time" className="input" value={reagendarHoraInicio}
                onChange={(e) => setReagendarHoraInicio(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Hora fim</label>
              <input type="time" className="input" value={reagendarHoraFim}
                onChange={(e) => setReagendarHoraFim(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={closeModal}>Cancelar</button>
            <button className="btn-primary btn-sm" onClick={submitReagendar} disabled={reagendar.isPending}>Reagendar</button>
          </div>
        </div>
      </Modal>
    </>
  )
}