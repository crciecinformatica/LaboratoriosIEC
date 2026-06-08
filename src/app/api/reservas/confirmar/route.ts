import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { ReservaService } from '@/services/reserva.service'
import { confirmarReservaActionSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'confirmar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = confirmarReservaActionSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const { reservaId, laboratorioId } = parse.data

  try {
    const { prisma } = await import('@/lib/prisma/client')
    const reserva = await prisma.solicitacaoReserva.findUnique({
      where: { id: reservaId },
      include: { datas: true },
    })
    if (!reserva) return NextResponse.json({ error: 'Reserva não encontrada' }, { status: 404 })

    const temConflito = await ReservaService.verificarConflitoDatas(
      laboratorioId,
      reserva.datas.map((d) => ({ dataInicio: d.dataInicio, dataFim: d.dataFim })),
      reservaId
    )
    if (temConflito) {
      return NextResponse.json(
        { error: 'Conflito de datas detectado para o laboratório selecionado' },
        { status: 409 }
      )
    }

    await ReservaService.confirmar(reservaId, { laboratorioId }, session.user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao confirmar reserva'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
