'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { ReservaMultistepForm } from '@/components/forms/reserva-multistep-form'
import { ChevronLeft } from 'lucide-react'

export default function NovaReservaPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const podeCriar = ['APOIO_ACADEMICO', 'ADMINISTRADOR'].includes(session?.user.perfil ?? '')

  useEffect(() => {
    if (status === 'loading') return
    if (!podeCriar) router.replace('/reservas')
  }, [status, podeCriar, router])

  if (status === 'loading' || !podeCriar) return null

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/reservas" className="btn-ghost btn-sm p-1.5">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <PageHeader
          title="Nova reserva"
          subtitle="Preencha os dados da solicitação em 4 etapas."
        />
      </div>
      <ReservaMultistepForm />
    </div>
  )
}
