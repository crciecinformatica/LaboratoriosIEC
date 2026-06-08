'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { criarReservaFormSchema } from '@/lib/validations/reserva'
import type { z } from 'zod'
import { useProfessores, useTurmas, useCreateReserva } from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, Upload, FileText } from 'lucide-react'

type FormInput = z.input<typeof criarReservaFormSchema>

const STEPS = ['Modalidade e vínculos', 'Dados acadêmicos', 'Datas e horários', 'Anexos']

const MODALIDADES = [
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'REMOTO', label: 'Remoto' },
  { value: 'RAS', label: 'RAS' },
] as const

function toISO(datetimeLocal: string) {
  return new Date(datetimeLocal).toISOString()
}

export function ReservaMultistepForm() {
  const router = useRouter()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [profManual, setProfManual] = useState(false)
  const [turmaManual, setTurmaManual] = useState(false)

  const { data: profData } = useProfessores('', 1, 100)
  const criar = useCreateReserva()
  const professores = profData?.professores ?? []

  const form = useForm<FormInput>({
    resolver: zodResolver(criarReservaFormSchema),
    defaultValues: {
      titulo: '',
      modalidadeReserva: 'PRESENCIAL',
      professorId: '',
      turmaId: '',
      professorManual: undefined,
      turmaManual: undefined,
      softwaresUtilizados: '',
      numeroAlunos: undefined,
      datas: [{ dataInicio: '', dataFim: '', recorrente: false }],
    },
  })

  const professorId = profManual ? '' : form.watch('professorId')
  const { data: turmaData } = useTurmas('', professorId, 1, 100)
  const turmas = turmaData?.turmas ?? []

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'datas' })
  const { errors } = form.formState

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
    if (turma) {
      if (!form.getValues('titulo')) {
        form.setValue('titulo', `Reserva — ${turma.nome}`)
      }
    }
  }

  async function validateStep(current: number) {
    if (current === 0) {
      if (profManual) return form.trigger(['titulo', 'modalidadeReserva', 'professorManual'])
      return form.trigger(['titulo', 'modalidadeReserva', 'professorId'])
    }
    if (current === 1) {
      const base = form.trigger(['softwaresUtilizados', 'numeroAlunos'])
      if (turmaManual) return Promise.all([base, form.trigger('turmaManual')])
      return Promise.all([base, form.trigger('turmaId')]).then((r) => r.every(Boolean))
    }
    if (current === 2) return form.trigger('datas')
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
      titulo: data.titulo,
      modalidadeReserva: data.modalidadeReserva,
      softwaresUtilizados: data.softwaresUtilizados,
      numeroAlunos: data.numeroAlunos,
      professorId: profManual ? undefined : data.professorId || undefined,
      turmaId: turmaManual ? undefined : data.turmaId || undefined,
      professorManual: profManual ? {
        ...data.professorManual!,
        matricula: data.professorManual?.matricula || undefined,
        telefone: data.professorManual?.telefone || undefined,
        departamento: data.professorManual?.departamento || undefined,
      } : undefined,
      turmaManual: turmaManual ? {
        ...data.turmaManual!,
        numOferta: data.turmaManual?.numOferta || undefined,
      } : undefined,
      datas: (data.datas ?? []).map((d) => ({
        dataInicio: toISO(d.dataInicio),
        dataFim: toISO(d.dataFim),
        recorrente: d.recorrente ?? false,
      })),
    }

    try {
      const reserva = await criar.mutateAsync(payload)
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        await fetch(`/api/reservas/${reserva.id}/anexos`, { method: 'POST', body: formData })
      }
      toast.success('Solicitação enviada com sucesso!')
      router.push(`/reservas/${reserva.id}`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao criar solicitação'
      toast.error(msg)
    }
  }

  return (
    <div className="card max-w-2xl">
      <div className="px-6 py-4 border-b border-slate-100 flex gap-1 overflow-x-auto">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`flex-shrink-0 text-center text-xs px-2 py-1.5 rounded-lg font-medium transition ${
              i === step ? 'bg-blue-50 text-blue-700' : i < step ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-400'
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <div className="px-6 py-5 flex flex-col gap-4">
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
              <input type="checkbox" checked={profManual} onChange={(e) => toggleProfManual(e.target.checked)} className="rounded" />
              <span className="text-sm text-slate-600">Professor não cadastrado — inserir manualmente</span>
            </label>

            {!profManual ? (
              <div className="form-group">
                <label className="label">Professor <span className="text-red-500">*</span></label>
                <select className="input" value={form.watch('professorId')} onChange={(e) => onProfessorSelect(e.target.value)}>
                  <option value="">Selecione</option>
                  {professores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome} {p.matricula ? `(${p.matricula})` : ''}</option>
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

        {step === 1 && (
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={turmaManual} onChange={(e) => toggleTurmaManual(e.target.checked)} className="rounded" />
              <span className="text-sm text-slate-600">Turma não cadastrada — inserir manualmente</span>
            </label>

            {!turmaManual ? (
              <div className="form-group">
                <label className="label">Turma <span className="text-red-500">*</span></label>
                <select
                  className="input"
                  value={form.watch('turmaId')}
                  disabled={!profManual && !professorId}
                  onChange={(e) => onTurmaSelect(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {turmas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} — {t.nome} ({t.curso})
                    </option>
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
              <textarea {...form.register('softwaresUtilizados')} className="input min-h-[60px]" />
              {errors.softwaresUtilizados && <p className="error-msg">{errors.softwaresUtilizados.message}</p>}
            </div>
            <div className="form-group">
              <label className="label">Número de alunos <span className="text-red-500">*</span></label>
              <input {...form.register('numeroAlunos', { valueAsNumber: true })} type="number" min={1} max={500} className="input" />
              <p className="text-xs text-slate-400 mt-1">Anexe a relação de alunos na etapa de anexos.</p>
              {errors.numeroAlunos && <p className="error-msg">{errors.numeroAlunos.message}</p>}
            </div>
          </>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="p-4 border border-slate-100 rounded-lg flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Horário {index + 1}</span>
                  {fields.length > 1 && (
                    <button type="button" className="btn-ghost btn-sm p-1 text-red-500" onClick={() => remove(index)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="label">Início <span className="text-red-500">*</span></label>
                    <input {...form.register(`datas.${index}.dataInicio`)} type="datetime-local" className="input" />
                  </div>
                  <div className="form-group">
                    <label className="label">Fim <span className="text-red-500">*</span></label>
                    <input {...form.register(`datas.${index}.dataFim`)} type="datetime-local" className="input" />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary btn-sm self-start" onClick={() => append({ dataInicio: '', dataFim: '', recorrente: false })}>
              <Plus className="w-3.5 h-3.5" /> Adicionar horário
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-500">Anexe planilha de alunos e demais documentos.</p>
            <label className="flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-blue-300 transition">
              <Upload className="w-8 h-8 text-slate-400" />
              <span className="text-sm text-slate-600">Selecionar arquivos</span>
              <input type="file" className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => {
                setFiles((p) => [...p, ...Array.from(e.target.files ?? [])])
                e.target.value = ''
              }} />
            </label>
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                <FileText className="w-4 h-4 text-slate-400" />
                <span className="text-sm truncate flex-1 mx-2">{f.name}</span>
                <button type="button" className="btn-ghost btn-sm p-1 text-red-500" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between pt-3 border-t border-slate-100">
          <button type="button" className="btn-secondary btn-sm" onClick={prevStep} disabled={step === 0}>
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary btn-sm" onClick={nextStep}>
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" className="btn-primary btn-sm" onClick={handleSubmitFinal} disabled={criar.isPending}>
              {criar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Enviar solicitação
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
