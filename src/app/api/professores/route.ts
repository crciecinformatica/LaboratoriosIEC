import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { z } from 'zod'

const schema = z.object({
  nome: z.string().min(3).max(100),
  email: z.string().email(),
  matricula: z.string().max(20).optional(),
  departamento: z.string().max(100).optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('q') ?? ''

  const professores = await prisma.professor.findMany({
    where: {
      ativo: true,
      OR: search
        ? [
            { nome: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    },
    include: { _count: { select: { turmas: true, reservas: true } } },
    orderBy: { nome: 'asc' },
  })

  return NextResponse.json(professores)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!['OPERADOR_TI', 'ADMINISTRADOR'].includes(session.user.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = schema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const existe = await prisma.professor.findUnique({ where: { email: parse.data.email } })
  if (existe) return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })

  const professor = await prisma.professor.create({ data: parse.data })
  return NextResponse.json(professor, { status: 201 })
}
