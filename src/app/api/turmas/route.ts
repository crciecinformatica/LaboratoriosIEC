import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { criarTurmaSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'turmas', 'listar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('q') ?? ''
  const professorId = searchParams.get('professorId')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))

  const where = {
    professorId: professorId ?? undefined,
    OR: search
      ? [
          { nome: { contains: search, mode: 'insensitive' as const } },
          { codigo: { contains: search, mode: 'insensitive' as const } },
        ]
      : undefined,
  }

  const [total, turmas] = await Promise.all([
    prisma.turma.count({ where }),
    prisma.turma.findMany({
      where,
      include: { professor: { select: { id: true, nome: true } } },
      orderBy: [{ semestre: 'desc' }, { nome: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({ turmas, total, page, limit })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'turmas', 'criar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = criarTurmaSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const existe = await prisma.turma.findUnique({ where: { codigo: parse.data.codigo } })
  if (existe) return NextResponse.json({ error: 'Código já em uso' }, { status: 409 })

  const turma = await prisma.turma.create({
    data: parse.data,
    include: { professor: { select: { id: true, nome: true } } },
  })
  return NextResponse.json(turma, { status: 201 })
}
