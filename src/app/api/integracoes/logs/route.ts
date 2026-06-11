import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { temPermissao } from '@/lib/auth/rbac'
import { prisma } from '@/lib/prisma/client'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  // Apenas OPERADOR_TI e ADMINISTRADOR podem acessar
  if (!temPermissao(session.user.perfil, 'integracoes', 'logs')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const servico = searchParams.get('servico')
  const erro = searchParams.get('erro') === 'true'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))

  // Construir where clause
  const where: any = {}
  if (servico) {
    where.servico = servico.toUpperCase()
  }
  if (erro) {
    where.erro = { not: null }
  }

  try {
    const [total, logs] = await Promise.all([
      prisma.logIntegracao.count({ where }),
      prisma.logIntegracao.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
    })
  } catch (err) {
    console.error('[GET /api/integracoes/logs]', err)
    return NextResponse.json({ error: 'Erro ao buscar logs' }, { status: 500 })
  }
}
