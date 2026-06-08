'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { ReservasKanban } from '@/components/kanban/reservas-kanban'

export default function KanbanPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isOperador = ['OPERADOR_TI', 'ADMINISTRADOR'].includes(session?.user.perfil ?? '')

  useEffect(() => {
    if (status === 'loading') return
    if (!isOperador) router.replace('/dashboard')
  }, [status, isOperador, router])

  if (status === 'loading' || !isOperador) return null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kanban de reservas"
        subtitle="Arraste os cards entre colunas para confirmar, rejeitar ou resolver conflitos."
      />
      <ReservasKanban />
    </div>
  )
}
