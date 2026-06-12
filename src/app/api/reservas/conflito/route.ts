import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { conflitoReservaSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { TipoEvento } from '@prisma/client'
import { transicaoValida } from '@/types'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'confirmar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body  = await req.json()
  const parse = conflitoReservaSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const { reservaId } = parse.data

  try {
    await prisma.$transaction(async (tx) => {
      const reserva = await tx.solicitacaoReserva.findUniqueOrThrow({
        where:  { id: reservaId },
        select: { status: true },
      })

      if (!transicaoValida(reserva.status, 'CONFLITO_DE_DATAS')) {
        throw new Error(`Transição inválida: ${reserva.status} → CONFLITO_DE_DATAS`)
      }

      // Marca todas as datas da reserva como em conflito
      await tx.dataHorarioReserva.updateMany({
        where: { reservaId },
        data:  { emConflito: true },
      })

      await tx.solicitacaoReserva.update({
        where: { id: reservaId },
        data:  { status: 'CONFLITO_DE_DATAS' },
      })

      await tx.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId:    session.user.id,
          evento:       TipoEvento.CONFLITO_DETECTADO,
          statusAntes:  reserva.status,
          statusDepois: 'CONFLITO_DE_DATAS',
        },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao marcar conflito'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
