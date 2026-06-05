import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { criarLaboratorioSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const lab = await prisma.laboratorio.findUnique({ where: { id: params.id } })
  if (!lab) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json(lab)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'laboratorios', 'editar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = criarLaboratorioSchema.partial().safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const lab = await prisma.laboratorio.update({
    where: { id: params.id },
    data: parse.data,
  })

  return NextResponse.json(lab)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'laboratorios', 'deletar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // Soft delete
  await prisma.laboratorio.update({
    where: { id: params.id },
    data: { ativo: false },
  })

  return new NextResponse(null, { status: 204 })
}
