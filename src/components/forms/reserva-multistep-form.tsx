'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { criarReservaFormSchema } from '@/lib/validations/reserva'
import type { z } from 'zod'
import { useProfessores, useTurmas, useCreateReserva } from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import {
  ChevronLeft, ChevronRight, Loader2,
  Upload, FileText, Trash2, Plus,
} from 'lucide-react'

type FormInput = z.input<typeof criarReservaFormSchema>

const STEPS = ['Modalidade e vínculos', 'Dados acadêmicos e softwares', 'Data e horários']

const MODALIDADES = [
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'REMOTO',     label: 'Remoto'     },
  { value: 'RAS',        label: 'RAS'        },
] as const

export function ReservaMultistepForm() {
  const router  = useRouter()
  const toast   = useToast()
  const [step, setStep]               = useState(0)
  const [files, setFiles]             = useState<File[]>([])
  const [profManual, setProfManual]   = useState(false)
  const [turmaManual, setTurmaManual] = useState(false)

  const { data: profData } = useProfessores('', 1, 100)
  const criar      = useCreateReserva()
  const professores = profData?.professores ?? []

  const form = useForm<FormInput>({
    resolver: zodResolver(criarReservaFormSchema),
    defaultValues: {
      titulo:              '',
      modalidadeReserva:   'PRESENCIAL',
      professorId:         '',
      turmaId:             '',
      professorManual:     undefined,
      turmaManual:         undefined,
      softwaresUtilizados: '',
      numeroAlunos:        undefined,
      dia:        '',
      horaInicio: '',
      horaFim:    '',
    },
  })

  const { errors } = form.formState

  // Filtrar turmas pelo professor selecionado
  const professorIdWatch = form.watch('professorId')
  const professorId = profManual ? '' : (professorIdWatch ?? '')
  const { data: turmaData } = useTurmas('', professorId, 1, 100)
  const turmas = turmaData?.turmas ?? []

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function toggleProfManual(enabled: boolean) {
    setProfManual(enabled)
    if (enabled) {
      form.setValue('professorId', '')
      form.setValue('professorManual', { nome: '', email: '', matricula: '', telefone: '' })
    } else {
      form.setValue('professorManual', undefined)
    }
  }

  function toggleTurmaManual(enabled: boolean) {
    setTurmaManual(enabled)
    if (enabled) {
      form.setValue('turmaId', '')
      form.setValue('turmaManual', {
        codigo: '', nome: '', semestre: '', curso: '', numOferta: '', codigoDisciplina: '',
      })
    } else {
      form.setValue('turmaManual', undefined)
    }
  }

  function onProfessorSelect(id: string) {
    form.setValue('professorId', id)
    form.setValue('turmaId', '')
    const prof = professores.find((p) => p.id === id)
    if (prof && !form.getValues('titulo')) {
      form.setValue('titulo', `Reserva — ${prof.nome}`)
    }
  }

  function onTurmaSelect(id: string) {
    form.setValue('turmaId', id)
    const turma = turmas.find((t) => t.id === id)
    if (turma && !form.getValues('titulo')) {
      form.setValue('titulo', `Reserva — ${turma.nome}`)
    }
  }

  async function validateStep(current: number): Promise<boolean> {
    if (current === 0) {
      const base = ['titulo', 'modalidadeReserva'] as const
      if (profManual) return form.trigger([...base, 'professorManual'])
      return form.trigger([...base, 'professorId'])
    }
    if (current === 1) {
      const base  = await form.trigger(['softwaresUtilizados', 'numeroAlunos'])
      const turmaOk = turmaManual
        ? await form.trigger('turmaManual')
        : await form.trigger('turmaId')
      return base && turmaOk
    }
    if (current === 2) return form.trigger(['dia', 'horaInicio', 'horaFim'])
    return true
  }

  async function nextStep() {
    const ok = await validateStep(step)
    if (!ok) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function prevStep() {
    setStep((s) => Math.max(s - 1, 0))
  }

  async function handleSubmitFinal() {
    const ok = await form.trigger()
    if (!ok) return

    const data = form.getValues()

    const payload = {
      titulo:              data.titulo,
      modalidadeReserva:   data.modalidadeReserva,
      softwaresUtilizados: data.softwaresUtilizados,
      numeroAlunos:        data.numeroAlunos!,
      professorId:  profManual  ? undefined : data.professorId  || undefined,
      turmaId:      turmaManual ? undefined : data.turmaId      || undefined,
      professorManual: profManual ? {
        ...data.professorManual!,
        matricula:    data.professorManual?.matricula    || undefined,
        telefone:     data.professorManual?.telefone     || undefined,
        departamento: data.professorManual?.departamento || undefined,
      } : undefined,
      turmaManual: turmaManual ? {
        ...data.turmaManual!,
        numOferta: data.turmaManual?.numOferta || undefined,
      } : undefined,
      // Envia "YYYY-MM-DD", "HH:MM", "HH:MM" — API valida e monta o DateTime
      dia:        data.dia,
      horaInicio: data.horaInicio,
      horaFim:    data.horaFim,
    }

    try {
      const reserva = await criar.mutateAsync(payload)

      // Upload de anexos — um a um, com feedback individual de erro
      let anexoErros = 0
      for (const file of files) {
        try {
          const fd = new FormData()
          fd.append('file', file)
          const res = await fetch(`/api/reservas/${reserva.id}/anexos`, {
            method: 'POST',
            body: fd,
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            console.error(`[Anexo] Falha ${file.name}:`, body)
            anexoErros++
          }
        } catch {
          anexoErros++
        }
      }

      if (anexoErros > 0) {
        toast.warning(`Reserva criada, mas ${anexoErros} anexo(s) falharam. Faça upload novamente na tela da reserva.`)
      } else {
        toast.success('Solicitação enviada com sucesso!')
      }

      router.push(`/reservas/${reserva.id}`)
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Erro ao criar solicitação'
      toast.error(msg)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="card max-w-2xl">
      {/* Stepper */}
      <div className="px-6 py-4 border-b border-slate-100 flex gap-1 overflow-x-auto">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`shrink-0 text-center text-xs px-2 py-1.5 rounded-lg font-medium transition ${
              i === step   ? 'bg-blue-50 text-blue-700'
              : i < step  ? 'bg-green-50 text-green-700'
              :              'bg-slate-50 text-slate-400'
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <div className="px-6 py-5 flex flex-col gap-4">

        {/* ── Step 0: Modalidade e vínculos ─────────────────────────────── */}
        {step === 0 && (
          <>
            <div className="form-group">
              <label className="label">Modalidade <span className="text-red-500">*</span></label>
              <select {...form.register('modalidadeReserva')} className="input">
                {MODALIDADES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={profManual}
                onChange={(e) => toggleProfManual(e.target.checked)} className="rounded" />
              <span className="text-sm text-slate-600">Professor não cadastrado — inserir manualmente</span>
            </label>

            {!profManual ? (
              <div className="form-group">
                <label className="label">Professor <span className="text-red-500">*</span></label>
                <select className="input" value={form.watch('professorId')}
                  onChange={(e) => onProfessorSelect(e.target.value)}>
                  <option value="">Selecione</option>
                  {professores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}{p.matricula ? ` (${p.matricula})` : ''}
                    </option>
                  ))}
                </select>
                {errors.professorId && <p className="error-msg">{errors.professorId.message}</p>}
              </div>
            ) : (
              <div className="p-4 border border-slate-100 rounded-lg flex flex-col gap-3">
                <div className="form-group">
                  <label className="label">Nome <span className="text-red-500">*</span></label>
                  <input {...form.register('professorManual.nome')} className="input" />
                  {errors.professorManual?.nome && <p className="error-msg">{errors.professorManual.nome.message}</p>}
                </div>
                <div className="form-group">
                  <label className="label">Email <span className="text-red-500">*</span></label>
                  <input {...form.register('professorManual.email')} type="email" className="input" />
                  {errors.professorManual?.email && <p className="error-msg">{errors.professorManual.email.message}</p>}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="label">Cód. pessoa / matrícula</label>
                    <input {...form.register('professorManual.matricula')} className="input" />
                  </div>
                  <div className="form-group">
                    <label className="label">Telefone</label>
                    <input {...form.register('professorManual.telefone')} className="input" />
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="label">Título <span className="text-red-500">*</span></label>
              <input {...form.register('titulo')} className="input" placeholder="Aula prática de Redes" />
              {errors.titulo && <p className="error-msg">{errors.titulo.message}</p>}
            </div>
          </>
        )}

        {/* ── Step 1: Dados acadêmicos e softwares ──────────────────────── */}
        {step === 1 && (
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={turmaManual}
                onChange={(e) => toggleTurmaManual(e.target.checked)} className="rounded" />
              <span className="text-sm text-slate-600">Turma não cadastrada — inserir manualmente</span>
            </label>

            {!turmaManual ? (
              <div className="form-group">
                <label className="label">Turma <span className="text-red-500">*</span></label>
                <select className="input" value={form.watch('turmaId')}
                  disabled={!profManual && !professorId}
                  onChange={(e) => onTurmaSelect(e.target.value)}>
                  <option value="">Selecione</option>
                  {turmas.map((t) => (
                    <option key={t.id} value={t.id}>{t.codigo} — {t.nome} ({t.curso})</option>
                  ))}
                </select>
                {errors.turmaId && <p className="error-msg">{errors.turmaId.message}</p>}
                <p className="text-xs text-slate-400 mt-1">Curso, oferta e disciplina são lidos do cadastro da turma.</p>
              </div>
            ) : (
              <div className="p-4 border border-slate-100 rounded-lg flex flex-col gap-3">
                <div className="form-row">
                  <div className="form-group">
                    <label className="label">Nº turma (código) <span className="text-red-500">*</span></label>
                    <input {...form.register('turmaManual.codigo')} className="input" placeholder="TI-2025-01" />
                    {errors.turmaManual?.codigo && <p className="error-msg">{errors.turmaManual.codigo.message}</p>}
                  </div>
                  <div className="form-group">
                    <label className="label">Semestre <span className="text-red-500">*</span></label>
                    <input {...form.register('turmaManual.semestre')} className="input" placeholder="2025/1" />
                    {errors.turmaManual?.semestre && <p className="error-msg">{errors.turmaManual.semestre.message}</p>}
                  </div>
                </div>
                <div className="form-group">
                  <label className="label">Nome da disciplina <span className="text-red-500">*</span></label>
                  <input {...form.register('turmaManual.nome')} className="input" />
                  {errors.turmaManual?.nome && <p className="error-msg">{errors.turmaManual.nome.message}</p>}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="label">Curso <span className="text-red-500">*</span></label>
                    <input {...form.register('turmaManual.curso')} className="input" />
                    {errors.turmaManual?.curso && <p className="error-msg">{errors.turmaManual.curso.message}</p>}
                  </div>
                  <div className="form-group">
                    <label className="label">Nº oferta</label>
                    <input {...form.register('turmaManual.numOferta')} className="input" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="label">Código disciplina <span className="text-red-500">*</span></label>
                  <input {...form.register('turmaManual.codigoDisciplina')} className="input" />
                  {errors.turmaManual?.codigoDisciplina && <p className="error-msg">{errors.turmaManual.codigoDisciplina.message}</p>}
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="label">Softwares <span className="text-red-500">*</span></label>
              <textarea {...form.register('softwaresUtilizados')}
                className="input min-h-[60px]" placeholder="Ex: Python 3.10, VS Code, PostgreSQL" />
              {errors.softwaresUtilizados && <p className="error-msg">{errors.softwaresUtilizados.message}</p>}
            </div>

            <div className="form-group">
              <label className="label">Número de alunos <span className="text-red-500">*</span></label>
              <input {...form.register('numeroAlunos', { valueAsNumber: true })}
                type="number" min={1} max={500} className="input" />
              <p className="text-xs text-slate-400 mt-1">Anexe a relação de alunos abaixo, se necessário.</p>
              {errors.numeroAlunos && <p className="error-msg">{errors.numeroAlunos.message}</p>}
            </div>

            {/* Anexos */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="label text-sm mb-3">
                Anexos{' '}
                <span className="text-xs text-slate-400 font-normal">(planilha de alunos, documentos, etc.)</span>
              </p>
              <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 transition">
                <Upload className="w-6 h-6 text-slate-400" />
                <span className="text-sm text-slate-600">Clique para selecionar arquivos</span>
                <input type="file" className="hidden" multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => {
                    setFiles((p) => [...p, ...Array.from(e.target.files ?? [])])
                    e.target.value = ''
                  }} />
              </label>
              {files.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-white rounded border border-slate-200">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm truncate flex-1 mx-2">{f.name}</span>
                      <button type="button" className="btn-ghost btn-sm p-1 text-red-500"
                        onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Step 2: Data e horários ────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            {/* Dia da aula */}
            <div className="form-group">
              <label className="label">Dia da aula <span className="text-red-500">*</span></label>
              <input {...form.register('dia')} type="date" className="input" />
              {errors.dia && <p className="error-msg">{errors.dia.message}</p>}
            </div>

            {/* Hora início + Hora fim */}
            <div className="form-row">
              <div className="form-group">
                <label className="label">Hora início <span className="text-red-500">*</span></label>
                <input {...form.register('horaInicio')} type="time" className="input" />
                {errors.horaInicio && <p className="error-msg">{errors.horaInicio.message}</p>}
              </div>
              <div className="form-group">
                <label className="label">Hora fim <span className="text-red-500">*</span></label>
                <input {...form.register('horaFim')} type="time" className="input" />
                {errors.horaFim && <p className="error-msg">{errors.horaFim.message}</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Navegação ─────────────────────────────────────────────────── */}
        <div className="flex justify-between pt-3 border-t border-slate-100">
          <button type="button" className="btn-secondary btn-sm" onClick={prevStep} disabled={step === 0}>
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>

          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary btn-sm" onClick={nextStep}>
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" className="btn-primary btn-sm"
              onClick={handleSubmitFinal} disabled={criar.isPending}>
              {criar.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Plus className="w-4 h-4" />}
              Enviar solicitação
            </button>
          )}
        </div>
      </div>
    </div>
  )
}