import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { ReservaService } from '@/services/reserva.service'
import { criarReservaSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  if (!temPermissao(session.user.perfil, 'reservas', 'criar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = criarReservaSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', detalhes: parse.error.flatten() },
      { status: 422 }
    )
  }

  try {
    const reserva = await ReservaService.criar(parse.data, session.user.id)
    return NextResponse.json(reserva, { status: 201 })
  } catch (err) {
    console.error('[POST /api/reservas]', err)
    return NextResponse.json({ error: 'Erro ao criar reserva' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  if (!temPermissao(session.user.perfil, 'reservas', 'listar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))

  const { prisma } = await import('@/lib/prisma/client')

  // Apoio Acadêmico vê apenas as próprias reservas
  const where =
    session.user.perfil === 'APOIO_ACADEMICO'
      ? { solicitanteId: session.user.id, ...(status ? { status: status as never } : {}) }
      : { ...(status ? { status: status as never } : {}) }

  const [total, reservas] = await Promise.all([
    prisma.solicitacaoReserva.count({ where }),
    prisma.solicitacaoReserva.findMany({
      where,
      include: {
        solicitante: { select: { id: true, nome: true } },
        professor: { select: { id: true, nome: true } },
        turma: { select: { id: true, codigo: true, nome: true } },
        laboratorio: { select: { id: true, nome: true, codigo: true } },
        datas: true,
      },
      orderBy: { criadoEm: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({ reservas, total, page, limit })
}
