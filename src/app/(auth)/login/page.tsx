'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, FlaskConical } from 'lucide-react'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Informe a senha'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setError('')
    const result = await signIn('credentials', {
      email: data.email,
      password: data.password,
      redirect: false,
    })
    if (result?.error) {
      setError('Email ou senha inválidos.')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 justify-center">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <FlaskConical className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs text-slate-400 leading-none">IEC</p>
          <p className="text-white font-semibold leading-tight">Agendamento de Labs</p>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8">
        <h1 className="text-lg font-semibold text-white mb-1">Entrar</h1>
        <p className="text-sm text-slate-400 mb-6">Acesse com suas credenciais institucionais</p>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="form-group">
            <label className="text-sm font-medium text-slate-300">Email</label>
            <input
              {...register('email')}
              type="email"
              placeholder="seu@iec.edu.br"
              autoComplete="email"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm
                         text-white placeholder:text-slate-500 focus:outline-none focus:ring-2
                         focus:ring-blue-500 focus:border-transparent transition"
            />
            {errors.email && <p className="error-msg text-red-400">{errors.email.message}</p>}
          </div>

          <div className="form-group">
            <label className="text-sm font-medium text-slate-300">Senha</label>
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm
                         text-white placeholder:text-slate-500 focus:outline-none focus:ring-2
                         focus:ring-blue-500 focus:border-transparent transition"
            />
            {errors.password && <p className="error-msg text-red-400">{errors.password.message}</p>}
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full justify-center py-2.5 mt-1"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-slate-500 mt-6">
        Problemas de acesso? Fale com o Operador TI.
      </p>
    </div>
  )
}
