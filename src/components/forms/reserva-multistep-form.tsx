'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { criarReservaFormSchema } from '@/lib/validations/reserva'
import type { z } from 'zod'
import { useProfessores, useTurmas, useCreateReserva } from '@/hooks/useApi'
import { useToast } from '@/components/ui/layout/toast'
import {
  ChevronLeft, ChevronRight, Loader2,
  Upload, FileText, Trash2, Plus, Search,
} from 'lucide-react'

type FormInput = z.input<typeof criarReservaFormSchema>

const STEPS = ['Modalidade e vínculos', 'Dados acadêmicos e softwares', 'Data e horários']

const MODALIDADES = [
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'REMOTO',     label: 'Remoto'     },
  { value: 'RAS',        label: 'RAS'        },
] as const

type SearchableSelectOption = {
  value: string
  label: string
  description?: string
}

function SearchableSelect({
  value,
  search,
  options,
  placeholder,
  emptyMessage,
  disabled,
  onSearchChange,
  onSelect,
}: {
  value: string
  search: string
  options: SearchableSelectOption[]
  placeholder: string
  emptyMessage: string
  disabled?: boolean
  onSearchChange: (value: string) => void
  onSelect: (option: SearchableSelectOption) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        type="text"
        className="input pl-9 pr-9"
        value={search}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 100)}
        onChange={(e) => {
          onSearchChange(e.target.value)
          setOpen(true)
        }}
      />
      <ChevronRight className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition ${open ? 'rotate-90' : ''}`} />

      {open && !disabled && (
        <div
          className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">{emptyMessage}</div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition ${
                  value === option.value ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                }`}
                onClick={() => {
                  onSelect(option)
                  setOpen(false)
                }}
              >
                <span className="block font-medium truncate">{option.label}</span>
                {option.description && (
                  <span className="block text-xs text-slate-400 truncate">{option.description}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function ReservaMultistepForm() {
  const router  = useRouter()
  const toast   = useToast()
  const [step, setStep]               = useState(0)
  const [files, setFiles]             = useState<File[]>([])
  const [profManual, setProfManual]   = useState(false)
  const [turmaManual, setTurmaManual] = useState(false)
  const [profSearch, setProfSearch]   = useState('')
  const [turmaSearch, setTurmaSearch] = useState('')

  const { data: profData } = useProfessores(profSearch, 1, 50)
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
      datas: [
        {
          dia: '',
          horaInicio: '',
          horaFim: '',
          recorrente: false,
        },
      ],
    },
  })

  const {
    fields: datasFields,
    append: appendData,
    remove: removeData,
  } = useFieldArray({
    control: form.control,
    name: 'datas',
  })

  const { errors } = form.formState

  // Filtrar turmas pelo professor selecionado
  const professorIdWatch = useWatch({ control: form.control, name: 'professorId' })
  const turmaIdWatch = useWatch({ control: form.control, name: 'turmaId' })
  const professorId = profManual ? '' : (professorIdWatch ?? '')
  const { data: turmaData } = useTurmas(turmaSearch, professorId, 1, 50)
  const turmas = turmaData?.turmas ?? []
  const professorOptions = professores.map((p) => ({
    value: p.id,
    label: p.nome,
    description: p.matricula ? `Cód. pessoa / matrícula: ${p.matricula}` : p.email,
  }))
  const turmaOptions = turmas.map((t) => ({
    value: t.id,
    label: `${t.codigo} — ${t.nome}`,
    description: `${t.curso} | Cód. disciplina: ${t.codigoDisciplina}`,
  }))

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function toggleProfManual(enabled: boolean) {
    setProfManual(enabled)
    if (enabled) {
      form.setValue('professorId', '')
      setProfSearch('')
      form.setValue('professorManual', { nome: '', email: '', matricula: '', telefone: '' })
    } else {
      form.setValue('professorManual', undefined)
    }
  }

  function toggleTurmaManual(enabled: boolean) {
    setTurmaManual(enabled)
    if (enabled) {
      form.setValue('turmaId', '')
      setTurmaSearch('')
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
    setTurmaSearch('')
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
    if (current === 2) {
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
      datas: data.datas,
    }

    try {
      const reserva = await criar.mutateAsync(payload)

      // Upload de anexos — um a um, com feedback individual de erro
      let anexoErros = 0
      for (const file of files) {
        try {
          const fd = new FormData()
          fd.append('file', file)
          await axios.post(`/api/reservas/${reserva.id}/anexos`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        } catch (err) {
          console.error(`[Anexo] Falha ${file.name}:`, err)
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
      if (msg === 'Professor já cadastrado no sistema') {
        form.setError('professorManual.matricula', { type: 'validate', message: msg })
        setStep(0)
      }
      if (msg === 'Turma já cadastrada no sistema') {
        form.setError('turmaManual.codigoDisciplina', { type: 'validate', message: msg })
        setStep(1)
      }
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
                <SearchableSelect
                  value={professorIdWatch ?? ''}
                  search={profSearch}
                  options={professorOptions}
                  placeholder="Pesquisar por nome ou código de pessoa"
                  emptyMessage="Nenhum professor encontrado"
                  onSearchChange={setProfSearch}
                  onSelect={(option) => {
                    setProfSearch(option.label)
                    onProfessorSelect(option.value)
                  }}
                />
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
                    {errors.professorManual?.matricula && <p className="error-msg">{errors.professorManual.matricula.message}</p>}
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
                <SearchableSelect
                  value={turmaIdWatch ?? ''}
                  search={turmaSearch}
                  options={turmaOptions}
                  placeholder="Pesquisar por nome da disciplina ou código de disciplina"
                  emptyMessage="Nenhuma turma encontrada"
                  onSearchChange={setTurmaSearch}
                  onSelect={(option) => {
                    setTurmaSearch(option.label)
                    onTurmaSelect(option.value)
                  }}
                />
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

            {datasFields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-lg border border-slate-200 p-4 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">
                    Data #{index + 1}
                  </h3>

                  {datasFields.length > 1 && (
                    <button
                      type="button"
                      className="btn-ghost text-red-500"
                      onClick={() => removeData(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="form-group">
                  <label className="label">
                    Dia <span className="text-red-500">*</span>
                  </label>

                  <input
                    type="date"
                    className="input"
                    {...form.register(`datas.${index}.dia`)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="label">
                      Hora início
                    </label>

                    <input
                      type="time"
                      className="input"
                      {...form.register(`datas.${index}.horaInicio`)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">
                      Hora fim
                    </label>

                    <input
                      type="time"
                      className="input"
                      {...form.register(`datas.${index}.horaFim`)}
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                appendData({
                  dia: '',
                  horaInicio: '',
                  horaFim: '',
                  recorrente: false,
                })
              }
            >
              <Plus className="w-4 h-4" />
              Adicionar data
            </button>
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
