import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { temPermissao } from '@/lib/auth/rbac'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temPermissao(session.user.perfil, 'auditoria', 'visualizar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const acao       = searchParams.get('acao')
  const entidade   = searchParams.get('entidade')
  const usuarioId  = searchParams.get('usuarioId')
  const entidadeId = searchParams.get('entidadeId')
  const de         = searchParams.get('de')
  const ate        = searchParams.get('ate')
  const page       = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit      = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))

  const where: Record<string, unknown> = {}
  if (acao)       where.acao       = acao
  if (entidade)   where.entidade   = entidade
  if (usuarioId)  where.usuarioId  = usuarioId
  if (entidadeId) where.entidadeId = entidadeId
  if (de || ate) {
    where.criadoEm = {
      ...(de  ? { gte: new Date(`${de}T00:00:00.000Z`)  } : {}),
      ...(ate ? { lte: new Date(`${ate}T23:59:59.999Z`) } : {}),
    }
  }

  const [total, logs] = await Promise.all([
    prisma.logOperacao.count({ where }),
    prisma.logOperacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        usuario: { select: { id: true, nome: true, email: true, perfil: true } },
      },
    }),
  ])

  return NextResponse.json({ logs, total, page, limit })
}