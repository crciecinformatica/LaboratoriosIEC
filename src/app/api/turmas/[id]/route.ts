import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { editarTurmaSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'turmas', 'listar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const turma = await prisma.turma.findUnique({
    where: { id },
    include: { professor: { select: { id: true, nome: true } } },
  })
  if (!turma) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json(turma)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'turmas', 'editar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = editarTurmaSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  if (parse.data.codigo) {
    const conflito = await prisma.turma.findFirst({
      where: { codigo: parse.data.codigo, NOT: { id } },
    })
    if (conflito) return NextResponse.json({ error: 'Código já em uso' }, { status: 409 })
  }

  const turma = await prisma.turma.update({
    where: { id },
    data: parse.data,
    include: { professor: { select: { id: true, nome: true } } },
  })

  return NextResponse.json(turma)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'turmas', 'deletar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const reservas = await prisma.solicitacaoReserva.count({ where: { turmaId: id } })
  if (reservas > 0) {
    return NextResponse.json(
      { error: 'Turma possui reservas vinculadas e não pode ser excluída' },
      { status: 409 }
    )
  }

  await prisma.turma.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
