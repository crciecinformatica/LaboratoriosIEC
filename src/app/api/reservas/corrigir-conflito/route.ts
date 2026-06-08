import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { ReservaService } from '@/services/reserva.service'
import { corrigirConflitoSchema } from '@/lib/validations/reserva'
import { prisma } from '@/lib/prisma/client'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await req.json()
  const parse = corrigirConflitoSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const reserva = await prisma.solicitacaoReserva.findUnique({
    where: { id: parse.data.reservaId },
    select: { solicitanteId: true },
  })
  if (!reserva) return NextResponse.json({ error: 'Reserva não encontrada' }, { status: 404 })

  if (
    !['ADMINISTRADOR', 'APOIO_ACADEMICO'].includes(session.user.perfil) &&
    reserva.solicitanteId !== session.user.id
  ) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    await ReservaService.corrigirConflito(parse.data, session.user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao corrigir conflito'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
