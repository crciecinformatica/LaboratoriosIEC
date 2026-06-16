'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CalendarDays, Loader2, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { SugestaoHorario, type HorarioDisponivel } from './sugestao-horario'
import { useReagendarReserva } from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'

interface DataConflito {
  id:         string
  dia:        string   // ISO string
  horaInicio: string
  horaFim:    string
  emConflito: boolean
}

interface Props {
  open:        boolean
  onClose:     () => void
  reservaId:   string
  laboratorioId: string | null
  datasConflito: DataConflito[]
  onSucesso?:  () => void
}

interface DataForm {
  dia:        string
  horaInicio: string
  horaFim:    string
}

function formatarDia(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso))
}

export function ConflitoDialog({ open, onClose, reservaId, laboratorioId, datasConflito, onSucesso }: Props) {
  const toast     = useToast()
  const reagendar = useReagendarReserva()

  // Inicializa o form com as datas em conflito como ponto de partida
  const [novasDatas, setNovasDatas] = useState<DataForm[]>(() =>
    datasConflito.length > 0
      ? datasConflito.map((d) => ({ dia: d.dia.split('T')[0], horaInicio: '', horaFim: '' }))
      : [{ dia: '', horaInicio: '', horaFim: '' }]
  )

  // Sugestões por índice da data que está sendo editada
  const [sugestoesPor, setSugestoesPor] = useState<Record<number, HorarioDisponivel[]>>({})
  const [loadingSugestoes, setLoadingSugestoes] = useState<Record<number, boolean>>({})
  const [selecionadoPor, setSelecionadoPor] = useState<Record<number, string>>({})

  // Busca sugestões para uma data específica
  const buscarSugestoes = useCallback(async (idx: number, dia: string) => {
    if (!dia || !laboratorioId) return
    setLoadingSugestoes((prev) => ({ ...prev, [idx]: true }))
    try {
      const url = new URL('/api/reservas/sugestao', window.location.origin)
      url.searchParams.set('laboratorioId', laboratorioId)
      url.searchParams.set('dia', dia)
      url.searchParams.set('duracaoMin', '120')
      if (reservaId) url.searchParams.set('excluirReservaId', reservaId)

      const res  = await fetch(url.toString())
      const data = await res.json()

      setSugestoesPor((prev) => ({ ...prev, [idx]: data.sugestoes ?? [] }))
    } catch {
      setSugestoesPor((prev) => ({ ...prev, [idx]: [] }))
    } finally {
      setLoadingSugestoes((prev) => ({ ...prev, [idx]: false }))
    }
  }, [laboratorioId, reservaId])

  // Busca sugestões ao abrir o dialog para datas que já têm dia preenchido
  useEffect(() => {
    if (!open) return
    novasDatas.forEach((d, idx) => {
      if (d.dia) buscarSugestoes(idx, d.dia)
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function atualizarData(idx: number, field: keyof DataForm, value: string) {
    setNovasDatas((prev) => prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)))
    // Ao trocar o dia, limpa horário e busca novas sugestões
    if (field === 'dia' && value) {
      setSelecionadoPor((prev) => ({ ...prev, [idx]: '' }))
      setNovasDatas((prev) => prev.map((d, i) => (i === idx ? { ...d, horaInicio: '', horaFim: '', dia: value } : d)))
      buscarSugestoes(idx, value)
    }
  }

  function selecionarSugestao(idx: number, horario: HorarioDisponivel) {
    const key = `${horario.horaInicio}|${horario.horaFim}`
    setSelecionadoPor((prev) => ({ ...prev, [idx]: key }))
    setNovasDatas((prev) =>
      prev.map((d, i) =>
        i === idx ? { ...d, horaInicio: horario.horaInicio, horaFim: horario.horaFim } : d
      )
    )
  }

  function adicionarData() {
    setNovasDatas((prev) => [...prev, { dia: '', horaInicio: '', horaFim: '' }])
  }

  function removerData(idx: number) {
    setNovasDatas((prev) => prev.filter((_, i) => i !== idx))
    setSugestoesPor((prev) => { const n = { ...prev }; delete n[idx]; return n })
    setSelecionadoPor((prev) => { const n = { ...prev }; delete n[idx]; return n })
  }

  async function handleSubmit() {
    const invalidas = novasDatas.filter((d) => !d.dia || !d.horaInicio || !d.horaFim)
    if (invalidas.length > 0) {
      toast.error('Preencha data e horário em todas as linhas.')
      return
    }

    try {
      await reagendar.mutateAsync({ reservaId, datas: novasDatas })
      toast.success('Novas datas enviadas! Reserva voltou para análise.')
      onSucesso?.()
      onClose()
    } catch (e: unknown) {
      toast.error(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Erro ao reagendar reserva.'
      )
    }
  }

  const datasEmConflito = datasConflito.filter((d) => d.emConflito)

  return (
    <Modal open={open} onClose={onClose} title="Resolver conflito de datas" size="lg">
      <div className="px-6 py-5 flex flex-col gap-6">

        {/* ─── Datas em conflito ─── */}
        {datasEmConflito.length > 0 && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-4 flex flex-col gap-2">
            <p className="text-sm font-medium text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Datas com conflito detectado:
            </p>
            <ul className="flex flex-col gap-1">
              {datasEmConflito.map((d) => (
                <li key={d.id} className="text-xs text-red-600 flex items-center gap-2">
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  {formatarDia(d.dia)} — {d.horaInicio} às {d.horaFim}
                </li>
              ))}
            </ul>
            <p className="text-xs text-red-500 mt-1">
              Informe novas datas e horários. Os horários disponíveis abaixo são sugeridos automaticamente.
            </p>
          </div>
        )}

        {/* ─── Editor de novas datas ─── */}
        <div className="flex flex-col gap-5">
          {novasDatas.map((d, idx) => (
            <div key={idx} className="flex flex-col gap-3 p-4 rounded-lg border border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Data {idx + 1}</span>
                {novasDatas.length > 1 && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm p-1 text-red-400 hover:text-red-600"
                    onClick={() => removerData(idx)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Picker de dia */}
              <div className="form-group">
                <label className="label">Dia</label>
                <input
                  type="date"
                  className="input"
                  value={d.dia}
                  onChange={(e) => atualizarData(idx, 'dia', e.target.value)}
                />
              </div>

              {/* Sugestões de horário */}
              {d.dia && (
                <SugestaoHorario
                  sugestoes={sugestoesPor[idx] ?? []}
                  loading={loadingSugestoes[idx] ?? false}
                  selecionado={selecionadoPor[idx] ?? null}
                  onSelecionar={(h) => selecionarSugestao(idx, h)}
                  onRecarregar={() => buscarSugestoes(idx, d.dia)}
                />
              )}

              {/* Horário manual (alternativo às sugestões) */}
              <div className="flex gap-3 items-end flex-wrap">
                <div className="form-group flex-1 min-w-[120px]">
                  <label className="label">Início (manual)</label>
                  <input
                    type="time"
                    className="input"
                    value={d.horaInicio}
                    onChange={(e) => {
                      setSelecionadoPor((prev) => ({ ...prev, [idx]: '' }))
                      atualizarData(idx, 'horaInicio', e.target.value)
                    }}
                  />
                </div>
                <div className="form-group flex-1 min-w-[120px]">
                  <label className="label">Fim (manual)</label>
                  <input
                    type="time"
                    className="input"
                    value={d.horaFim}
                    onChange={(e) => {
                      setSelecionadoPor((prev) => ({ ...prev, [idx]: '' }))
                      atualizarData(idx, 'horaFim', e.target.value)
                    }}
                  />
                </div>
                {d.horaInicio && d.horaFim && (
                  <div className="self-end pb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="btn-secondary btn-sm self-start" onClick={adicionarData}>
          <Plus className="w-3.5 h-3.5" /> Adicionar outra data
        </button>

        {/* ─── Ações ─── */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button className="btn-secondary btn-sm" onClick={onClose} disabled={reagendar.isPending}>
            Cancelar
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={reagendar.isPending}
          >
            {reagendar.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Enviar novas datas para análise
          </button>
        </div>
      </div>
    </Modal>
  )
}