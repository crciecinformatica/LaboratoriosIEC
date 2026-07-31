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
  useReagendarReserva,
  type KanbanCard,
} from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { Modal } from '@/components/ui/modal'
import { MarcarConflitoDialog } from '@/components/reservas/marcar-conflito-dialog'
import { statusLabel, statusColor, transicaoValida } from '@/types'
import type { StatusReserva } from '@prisma/client'
import { Loader2, GripVertical, Plus, Trash2 } from 'lucide-react'

const COLUNAS: StatusReserva[] = [
  'AGUARDANDO_CONFIRMACAO',
  'CONFIRMADA',
  'CONFLITO_DE_DATAS',
  'REJEITADA',
]

// Bordas das colunas por status — usando variáveis semânticas via style inline
const columnBorderVar: Record<string, string> = {
  gray:  'var(--border)',
  amber: 'var(--color-warning-border)',
  green: 'var(--color-success-border)',
  red:   'var(--color-danger-border)',
  coral: 'var(--color-warning-border)',
}

function formatarDia(iso: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

function resumoDatas(datas: KanbanCard['datas']): string {
  if (datas.length === 0) return '—'
  if (datas.length === 1) return `${formatarDia(datas[0].dia)}, ${datas[0].horaInicio}–${datas[0].horaFim}`
  return `${formatarDia(datas[0].dia)} +${datas.length - 1} data${datas.length - 1 > 1 ? 's' : ''}`
}

// ─── Editor de múltiplas datas ────────────────────────────────────────────────

type DataForm = { dia: string; horaInicio: string; horaFim: string }

function EditorDatas({ value, onChange }: { value: DataForm[]; onChange: (d: DataForm[]) => void }) {
  function add() { onChange([...value, { dia: '', horaInicio: '', horaFim: '' }]) }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)) }
  function update(i: number, field: keyof DataForm, val: string) {
    onChange(value.map((d, idx) => (idx === i ? { ...d, [field]: val } : d)))
  }

  return (
    <div className="flex flex-col gap-2">
      {value.map((d, i) => (
        <div key={i} className="flex items-end gap-2 flex-wrap">
          <div className="form-group flex-1 min-w-[130px]">
            {i === 0 && <label className="label">Data</label>}
            <input type="date" className="input" value={d.dia}
              onChange={(e) => update(i, 'dia', e.target.value)} />
          </div>
          <div className="form-group">
            {i === 0 && <label className="label">Início</label>}
            <input type="time" className="input" value={d.horaInicio}
              onChange={(e) => update(i, 'horaInicio', e.target.value)} />
          </div>
          <div className="form-group">
            {i === 0 && <label className="label">Fim</label>}
            <input type="time" className="input" value={d.horaFim}
              onChange={(e) => update(i, 'horaFim', e.target.value)} />
          </div>
          {value.length > 1 && (
            <button type="button"
              className="btn-ghost btn-sm p-1.5 text-[var(--color-danger)] self-end mb-0.5"
              onClick={() => remove(i)}>
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

// ─── Card do Kanban ───────────────────────────────────────────────────────────

function KanbanCardItem({ card }: { card: KanbanCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card } })
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      className={`bg-card rounded-lg border border-border p-3 shadow-sm cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <Link href={`/reservas/${card.id}`}
            className="text-sm font-medium text-foreground hover:text-[var(--color-info)] line-clamp-2"
            onClick={(e) => e.stopPropagation()}>
            {card.titulo}
          </Link>
          <p className="text-xs text-muted-foreground mt-1">{card.professor.nome}</p>
          <p className="text-xs text-muted-foreground/60">{card.turma.codigo}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {resumoDatas(card.datas)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Coluna do Kanban ─────────────────────────────────────────────────────────

function KanbanColumn({ status, cards }: { status: StatusReserva; cards: KanbanCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const borderColor = columnBorderVar[statusColor[status]] ?? 'var(--border)'

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col min-w-[260px] flex-1 rounded-xl border-2"
      style={{
        borderColor,
        background: isOver ? 'var(--accent)' : 'var(--muted)',
      }}
    >
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{statusLabel[status]}</span>
        <span className="text-xs text-muted-foreground bg-card px-1.5 py-0.5 rounded-full border border-border">{cards.length}</span>
      </div>
      <div className="flex flex-col gap-2 p-2 flex-1">
        {cards.map((card) => (
          <KanbanCardItem key={card.id} card={card} />
        ))}
      </div>
    </div>
  )
}

// ─── Board principal ──────────────────────────────────────────────────────────

function ReservasKanban() {
  const { data, isLoading, refetch } = useKanbanReservas()
  const { data: labData }            = useLaboratorios('', 1, 100)
  const confirmar = useConfirmReserva()
  const rejeitar  = useRejectReserva()
  const reagendar = useReagendarReserva()
  const toast     = useToast()

  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)
  const [modal,   setModal]   = useState<'confirmar' | 'rejeitar' | 'reagendar' | 'conflito' | null>(null)
  const [pending, setPending] = useState<{ cardId: string; targetStatus: StatusReserva } | null>(null)
  const [labId,  setLabId]  = useState('')
  const [motivo, setMotivo] = useState('')
  const [reagendarDatas, setReagendarDatas] = useState<DataForm[]>([
    { dia: '', horaInicio: '', horaFim: '' },
  ])

  const sensors      = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
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

    if      (targetStatus === 'CONFIRMADA')             setModal('confirmar')
    else if (targetStatus === 'REJEITADA')              setModal('rejeitar')
    else if (targetStatus === 'CONFLITO_DE_DATAS')      setModal('conflito')
    else if (targetStatus === 'AGUARDANDO_CONFIRMACAO') setModal('reagendar')
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
    if (!pending) return
    const invalidas = reagendarDatas.filter((d) => !d.dia || !d.horaInicio || !d.horaFim)
    if (invalidas.length > 0) {
      toast.error('Preencha todos os campos de data e horário.')
      return
    }
    try {
      await reagendar.mutateAsync({ reservaId: pending.cardId, datas: reagendarDatas })
      toast.success('Reagendamento realizado!')
      closeModal(); refetch()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro')
    }
  }

  function closeModal() {
    setModal(null); setPending(null)
    setLabId(''); setMotivo('')
    setReagendarDatas([{ dia: '', horaInicio: '', horaFim: '' }])
  }

  const pendingCard = pending ? findCard(pending.cardId) : undefined

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
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
            <div className="bg-card rounded-lg border border-border p-3 shadow-lg w-[240px] opacity-90">
              <p className="text-sm font-medium text-foreground">{activeCard.titulo}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Modal open={modal === 'confirmar'} onClose={closeModal} title="Confirmar reserva" size="sm">
        <div className="px-6 py-4 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Selecione o laboratório para vincular à reserva.</p>
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

      <MarcarConflitoDialog
        open={modal === 'conflito'}
        onClose={closeModal}
        reservaId={pendingCard?.id ?? ''}
        datas={pendingCard?.datas ?? []}
        onSucesso={() => { closeModal(); refetch() }}
      />

      <Modal open={modal === 'reagendar'} onClose={closeModal} title="Reagendar após conflito" size="md">
        <div className="px-6 py-4 flex flex-col gap-4">
          <EditorDatas value={reagendarDatas} onChange={setReagendarDatas} />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={closeModal}>Cancelar</button>
            <button className="btn-primary btn-sm" onClick={submitReagendar} disabled={reagendar.isPending}>Reagendar</button>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default function KanbanPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Kanban de reservas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Arraste os cartões para alterar o status da reserva.</p>
      </div>
      <ReservasKanban />
    </div>
  )
}