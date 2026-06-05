import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { z } from 'zod'

const schema = z.object({
  codigo: z.string().min(2).max(30),
  nome: z.string().min(3).max(100),
  semestre: z.string().regex(/^\d{4}\/[12]$/, 'Formato: YYYY/1 ou YYYY/2'),
  professorId: z.string().cuid(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('q') ?? ''
  const professorId = searchParams.get('professorId')

  const turmas = await prisma.turma.findMany({
    where: {
      professorId: professorId ?? undefined,
      OR: search
        ? [
            { nome: { contains: search, mode: 'insensitive' } },
            { codigo: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    },
    include: { professor: { select: { id: true, nome: true } } },
    orderBy: [{ semestre: 'desc' }, { nome: 'asc' }],
  })

  return NextResponse.json(turmas)
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

  const existe = await prisma.turma.findUnique({ where: { codigo: parse.data.codigo } })
  if (existe) return NextResponse.json({ error: 'Código já em uso' }, { status: 409 })

  const turma = await prisma.turma.create({
    data: parse.data,
    include: { professor: { select: { id: true, nome: true } } },
  })
  return NextResponse.json(turma, { status: 201 })
}
