import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { editarProfessorSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'professores', 'listar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const professor = await prisma.professor.findUnique({
    where: { id },
    include: { _count: { select: { turmas: true, reservas: true } } },
  })
  if (!professor) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json(professor)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'professores', 'editar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = editarProfessorSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  if (parse.data.email) {
    const conflito = await prisma.professor.findFirst({
      where: { email: parse.data.email, NOT: { id } },
    })
    if (conflito) return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })
  }

  const professor = await prisma.professor.update({
    where: { id },
    data: parse.data,
    include: { _count: { select: { turmas: true, reservas: true } } },
  })

  return NextResponse.json(professor)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'professores', 'deletar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  await prisma.professor.update({
    where: { id },
    data: { ativo: false },
  })

  return new NextResponse(null, { status: 204 })
}
