'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, CalendarDays, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { useMarcarConflitoReserva } from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'

interface DataReserva {
  id:         string
  dia:        string   // ISO string
  horaInicio: string
  horaFim:    string
  emConflito: boolean
}

interface Props {
  open:      boolean
  onClose:   () => void
  reservaId: string
  datas:     DataReserva[]
  onSucesso?: () => void
}

function formatarDia(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso))
}

/**
 * Dialog para o operador/admin marcar conflito em UMA OU MAIS datas
 * específicas da reserva, em vez de conflitar automaticamente todas as
 * datas. Cada data tem um checkbox independente.
 */
export function MarcarConflitoDialog({ open, onClose, reservaId, datas, onSucesso }: Props) {
  const toast    = useToast()
  const conflito = useMarcarConflitoReserva()

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())

  // Ao abrir, reseta a seleção (nenhuma data pré-marcada — força escolha consciente)
  useEffect(() => {
    if (open) setSelecionadas(new Set())
  }, [open])

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selecionarTodas() {
    setSelecionadas(new Set(datas.map((d) => d.id)))
  }

  function limparSelecao() {
    setSelecionadas(new Set())
  }

  async function handleSubmit() {
    if (selecionadas.size === 0) {
      toast.error('Selecione ao menos uma data para marcar conflito.')
      return
    }

    try {
      await conflito.mutateAsync({
        reservaId,
        dataHorarioIds: Array.from(selecionadas),
      })
      toast.success(
        selecionadas.size === datas.length
          ? 'Conflito registrado em todas as datas.'
          : `Conflito registrado em ${selecionadas.size} data(s) selecionada(s).`
      )
      onSucesso?.()
      onClose()
    } catch (e: unknown) {
      toast.error(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Erro ao marcar conflito.'
      )
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Marcar conflito de datas" size="sm">
      <div className="px-6 py-4 flex flex-col gap-4">
        <p className="text-sm text-slate-600 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          Selecione quais datas estão em conflito. O solicitante poderá propor
          novos horários apenas para as datas marcadas.
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            {selecionadas.size} de {datas.length} selecionada(s)
          </span>
          <div className="flex gap-2">
            <button type="button" className="text-xs text-blue-600 hover:underline" onClick={selecionarTodas}>
              Selecionar todas
            </button>
            <span className="text-slate-300">|</span>
            <button type="button" className="text-xs text-slate-500 hover:underline" onClick={limparSelecao}>
              Limpar
            </button>
          </div>
        </div>

        <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto">
          {datas.map((d) => {
            const checked = selecionadas.has(d.id)
            return (
              <li key={d.id}>
                <label
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                    checked
                      ? 'border-red-200 bg-red-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-red-600"
                    checked={checked}
                    onChange={() => toggle(d.id)}
                  />
                  <CalendarDays className={`w-3.5 h-3.5 shrink-0 ${checked ? 'text-red-500' : 'text-slate-400'}`} />
                  <span className={`text-sm ${checked ? 'text-red-700 font-medium' : 'text-slate-700'}`}>
                    {formatarDia(d.dia)} — {d.horaInicio} às {d.horaFim}
                  </span>
                  {d.emConflito && (
                    <span className="ml-auto text-[10px] text-red-500 bg-red-100 px-1.5 py-0.5 rounded">
                      já em conflito
                    </span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button className="btn-secondary btn-sm" onClick={onClose} disabled={conflito.isPending}>
            Cancelar
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={conflito.isPending || selecionadas.size === 0}
          >
            {conflito.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirmar conflito{selecionadas.size > 0 ? ` (${selecionadas.size})` : ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}