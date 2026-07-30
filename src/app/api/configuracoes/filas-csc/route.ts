import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { criarFilaChamadoSchema } from '@/lib/validations/configuracao'
import { temPermissao } from '@/lib/auth/rbac'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const apenasAtivos = searchParams.get('ativos') !== 'false'

  const where = {
    ativo: apenasAtivos ? true : undefined,
  }

  const filas = await prisma.filaChamado.findMany({
    where,
    orderBy: { nome: 'asc' },
  })

  return NextResponse.json({ filas })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Somente ADMINISTRADOR ou OPERADOR_TI podem configurar as filas
  if (!['ADMINISTRADOR', 'OPERADOR_TI'].includes(session.user.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = criarFilaChamadoSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const existe = await prisma.filaChamado.findUnique({ where: { flexfield: parse.data.flexfield } })
  if (existe) return NextResponse.json({ error: 'Flexfield já em uso por outra fila' }, { status: 409 })

  const fila = await prisma.filaChamado.create({ data: parse.data })

  registrarLog({
    usuarioId:  session.user.id,
    acao:       'CRIAR',
    entidade:   'SISTEMA',
    entidadeId: fila.id,
    descricao:  `Criou Fila CSC "${fila.nome}" (${fila.flexfield})`,
    ip:         extrairIp(req),
  }).catch((e) => console.error('[AuditLog]', e))

  return NextResponse.json(fila, { status: 201 })
}
