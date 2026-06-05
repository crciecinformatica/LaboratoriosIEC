import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { criarLaboratorioSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('q') ?? ''
  const apenasAtivos = searchParams.get('ativos') !== 'false'

  const laboratorios = await prisma.laboratorio.findMany({
    where: {
      ativo: apenasAtivos ? true : undefined,
      OR: search
        ? [
            { nome: { contains: search, mode: 'insensitive' } },
            { codigo: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    },
    orderBy: { nome: 'asc' },
  })

  return NextResponse.json(laboratorios)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'laboratorios', 'criar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = criarLaboratorioSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', detalhes: parse.error.flatten() },
      { status: 422 }
    )
  }

  const existe = await prisma.laboratorio.findUnique({
    where: { codigo: parse.data.codigo },
  })
  if (existe) {
    return NextResponse.json({ error: 'Código já em uso' }, { status: 409 })
  }

  const lab = await prisma.laboratorio.create({ data: parse.data })
  return NextResponse.json(lab, { status: 201 })
}
