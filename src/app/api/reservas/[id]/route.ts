import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { temPermissao } from '@/lib/auth/rbac'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'listar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const reserva = await prisma.solicitacaoReserva.findUnique({
    where: { id },
    include: {
      solicitante: { select: { id: true, nome: true, email: true } },
      professor:   true,
      turma:       true,
      laboratorio: true,
      // sem datas — dia/horaInicio/horaFim são campos diretos
      historico: {
        include: { usuario: { select: { id: true, nome: true } } },
        orderBy: { criadoEm: 'asc' },
      },
      anexos: { orderBy: { criadoEm: 'desc' } },
    },
  })

  if (!reserva) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  if (
    session.user.perfil === 'APOIO_ACADEMICO' &&
    reserva.solicitanteId !== session.user.id
  ) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  return NextResponse.json(reserva)
}