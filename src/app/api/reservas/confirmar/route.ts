import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { ReservaService } from '@/services/reserva.service'
import { IntegracoesService } from '@/services/integracao.service'
import { confirmarReservaActionSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'confirmar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body  = await req.json()
  const parse = confirmarReservaActionSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const { reservaId, laboratorioId } = parse.data

  try {
    const { prisma } = await import('@/lib/prisma/client')

    // Verificar conflito usando dia/horaInicio/horaFim (novo modelo)
    const reserva = await prisma.solicitacaoReserva.findUnique({
      where:  { id: reservaId },
      select: { dia: true, horaInicio: true, horaFim: true },
    })
    if (!reserva) return NextResponse.json({ error: 'Reserva não encontrada' }, { status: 404 })

    const temConflito = await ReservaService.verificarConflitoDatas(
      laboratorioId,
      reserva.dia,
      reserva.horaInicio,
      reserva.horaFim,
      reservaId
    )

    if (temConflito) {
      return NextResponse.json(
        { error: 'Conflito de datas detectado para o laboratório selecionado' },
        { status: 409 }
      )
    }

    await ReservaService.confirmar(reservaId, { laboratorioId }, session.user.id)

    IntegracoesService.notificarConfirmacao(reservaId)
      .catch((err) => console.error('[Sprint5] Falha notificarConfirmacao:', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao confirmar reserva'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}