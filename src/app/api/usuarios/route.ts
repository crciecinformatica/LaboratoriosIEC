import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { criarUsuarioSchema } from '@/lib/validations/reserva'
import bcrypt from 'bcryptjs'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.user.perfil !== 'ADMINISTRADOR') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('q') ?? ''

  const usuarios = await prisma.usuario.findMany({
    where: search
      ? {
          OR: [
            { nome: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true },
    orderBy: { nome: 'asc' },
  })

  return NextResponse.json(usuarios)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.user.perfil !== 'ADMINISTRADOR') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = criarUsuarioSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const existe = await prisma.usuario.findUnique({ where: { email: parse.data.email } })
  if (existe) return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })

  const senhaHash = await bcrypt.hash(parse.data.senha, 12)

  const usuario = await prisma.usuario.create({
    data: {
      nome: parse.data.nome,
      email: parse.data.email,
      senhaHash,
      perfil: parse.data.perfil,
    },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true },
  })

  return NextResponse.json(usuario, { status: 201 })
}
