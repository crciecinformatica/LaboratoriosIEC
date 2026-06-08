'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { criarReservaFormSchema } from '@/lib/validations/reserva'
import type { z } from 'zod'
import { useProfessores, useTurmas, useCreateReserva, useUploadAnexo } from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, Upload, FileText } from 'lucide-react'

type FormInput = z.input<typeof criarReservaFormSchema>

const STEPS = ['Dados gerais', 'Datas e horários', 'Anexos']

function toISO(datetimeLocal: string) {
  return new Date(datetimeLocal).toISOString()
}

export function ReservaMultistepForm() {
  const router = useRouter()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [createdId, setCreatedId] = useState<string | null>(null)

  const { data: profData } = useProfessores('', 1, 100)
  const criar = useCreateReserva()
  const upload = useUploadAnexo(createdId ?? '')

  const professores = profData?.professores ?? []

  const form = useForm<FormInput>({
    resolver: zodResolver(criarReservaFormSchema),
    defaultValues: {
      titulo: '',
      descricao: '',
      professorId: '',
      turmaId: '',
      datas: [{ dataInicio: '', dataFim: '', recorrente: false }],
    },
  })

  const professorId = form.watch('professorId')
  const { data: turmaData } = useTurmas('', professorId, 1, 100)
  const turmas = turmaData?.turmas ?? []

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'datas',
  })

  const { errors } = form.formState

  async function validateStep(current: number) {
    if (current === 0) {
      return form.trigger(['titulo', 'professorId', 'turmaId'])
    }
    if (current === 1) {
      return form.trigger('datas')
    }
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    setFiles((prev) => [...prev, ...selected])
    e.target.value = ''
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function onSubmit(data: FormInput) {
    const payload = {
      ...data,
      datas: (data.datas ?? []).map((d) => ({
        dataInicio: toISO(d.dataInicio),
        dataFim: toISO(d.dataFim),
        recorrente: d.recorrente ?? false,
      })),
    }

    try {
      const reserva = await criar.mutateAsync(payload)
      setCreatedId(reserva.id)

      if (files.length > 0) {
        for (const file of files) {
          const formData = new FormData()
          formData.append('file', file)
          await fetch(`/api/reservas/${reserva.id}/anexos`, {
            method: 'POST',
            body: formData,
          })
        }
      }

      toast.success('Reserva criada com sucesso!')
      router.push(`/reservas/${reserva.id}`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao criar reserva'
      toast.error(msg)
    }
  }

  const isSubmitting = criar.isPending || upload.isPending

  return (
    <div className="card max-w-2xl">
      {/* Step indicator */}
      <div className="px-6 py-4 border-b border-slate-100 flex gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`flex-1 text-center text-xs py-1.5 rounded-lg font-medium transition ${
              i === step
                ? 'bg-blue-50 text-blue-700'
                : i < step
                  ? 'bg-green-50 text-green-700'
                  : 'bg-slate-50 text-slate-400'
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-5 flex flex-col gap-4">
        {/* Step 1 */}
        {step === 0 && (
          <>
            <div className="form-group">
              <label className="label">Título <span className="text-red-500">*</span></label>
              <input {...form.register('titulo')} className="input" placeholder="Aula prática de Redes" />
              {errors.titulo && <p className="error-msg">{errors.titulo.message}</p>}
            </div>
            <div className="form-group">
              <label className="label">Descrição</label>
              <textarea {...form.register('descricao')} className="input min-h-[80px]" placeholder="Detalhes da solicitação..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="label">Professor <span className="text-red-500">*</span></label>
                <select {...form.register('professorId')} className="input" onChange={(e) => {
                  form.setValue('professorId', e.target.value)
                  form.setValue('turmaId', '')
                }}>
                  <option value="">Selecione</option>
                  {professores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
                {errors.professorId && <p className="error-msg">{errors.professorId.message}</p>}
              </div>
              <div className="form-group">
                <label className="label">Turma <span className="text-red-500">*</span></label>
                <select {...form.register('turmaId')} className="input" disabled={!professorId}>
                  <option value="">Selecione</option>
                  {turmas.map((t) => (
                    <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>
                  ))}
                </select>
                {errors.turmaId && <p className="error-msg">{errors.turmaId.message}</p>}
              </div>
            </div>
          </>
        )}

        {/* Step 2 */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">Informe ao menos um horário desejado para a reserva.</p>
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
                    <input
                      {...form.register(`datas.${index}.dataInicio`)}
                      type="datetime-local"
                      className="input"
                    />
                    {errors.datas?.[index]?.dataInicio && (
                      <p className="error-msg">{errors.datas[index]?.dataInicio?.message}</p>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="label">Fim <span className="text-red-500">*</span></label>
                    <input
                      {...form.register(`datas.${index}.dataFim`)}
                      type="datetime-local"
                      className="input"
                    />
                    {errors.datas?.[index]?.dataFim && (
                      <p className="error-msg">{errors.datas[index]?.dataFim?.message}</p>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input {...form.register(`datas.${index}.recorrente`)} type="checkbox" className="rounded" />
                  <span className="text-sm text-slate-600">Horário recorrente</span>
                </label>
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary btn-sm self-start"
              onClick={() => append({ dataInicio: '', dataFim: '', recorrente: false })}
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar horário
            </button>
            {errors.datas?.root && <p className="error-msg">{errors.datas.root.message}</p>}
            {typeof errors.datas?.message === 'string' && (
              <p className="error-msg">{errors.datas.message}</p>
            )}
          </div>
        )}

        {/* Step 3 */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-500">
              Anexe documentos de apoio (PDF, imagens ou DOC). Máximo 10 MB por arquivo.
            </p>
            <label className="flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition">
              <Upload className="w-8 h-8 text-slate-400" />
              <span className="text-sm text-slate-600">Clique para selecionar arquivos</span>
              <input type="file" className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={handleFileChange} />
            </label>
            {files.length > 0 && (
              <ul className="flex flex-col gap-2">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{f.name}</span>
                      <span className="text-xs text-slate-400">({(f.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button type="button" className="btn-ghost btn-sm p-1 text-red-500" onClick={() => removeFile(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-3 border-t border-slate-100">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={prevStep}
            disabled={step === 0}
          >
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>

          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary btn-sm" onClick={nextStep}>
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="submit" className="btn-primary btn-sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Enviar solicitação
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
