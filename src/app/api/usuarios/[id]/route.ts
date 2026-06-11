import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { editarUsuarioSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'usuarios', 'listar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, codigoPessoa: true, criadoEm: true },
  })
  if (!usuario) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json(usuario)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'usuarios', 'editar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = editarUsuarioSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const usuario = await prisma.usuario.update({
    where: { id },
    data: parse.data,
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, codigoPessoa: true, criadoEm: true },
  })

  return NextResponse.json(usuario)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'usuarios', 'deletar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  if (session.user.id === id) {
    return NextResponse.json({ error: 'Não é possível desativar o próprio usuário' }, { status: 409 })
  }

  await prisma.usuario.update({
    where: { id },
    data: { ativo: false },
  })

  return new NextResponse(null, { status: 204 })
}
