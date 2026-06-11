
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { temPermissao } from '@/lib/auth/rbac'
import { StatusReserva } from '@prisma/client'

const COLUNAS: StatusReserva[] = [
  'AGUARDANDO_CONFIRMACAO',
  'CONFIRMADA',
  'CONFLITO_DE_DATAS',
  'REJEITADA',
]

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'confirmar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const reservas = await prisma.solicitacaoReserva.findMany({
    where:   { status: { in: COLUNAS } },
    include: {
      solicitante: { select: { id: true, nome: true } },
      professor:   { select: { id: true, nome: true } },
      turma:       { select: { id: true, codigo: true, nome: true } },
      laboratorio: { select: { id: true, nome: true, codigo: true } },
      datas:       { orderBy: { dia: 'asc' } },
    },
    orderBy: { criadoEm: 'desc' },
  })

  const colunas = COLUNAS.map((status) => ({
    status,
    reservas: reservas.filter((r) => r.status === status),
  }))

  return NextResponse.json({ colunas })
}