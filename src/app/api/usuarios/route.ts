import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { criarUsuarioSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'
import bcrypt from 'bcryptjs'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'usuarios', 'listar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('q') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))

  const where = search
    ? { OR: [{ nome: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } }] }
    : undefined

  const [total, usuarios] = await Promise.all([
    prisma.usuario.count({ where }),
    prisma.usuario.findMany({
      where,
      select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true, codigoPessoa: true },
      orderBy: { nome: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({ usuarios, total, page, limit })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'usuarios', 'criar')) {
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
    data: { nome: parse.data.nome, email: parse.data.email, senhaHash, perfil: parse.data.perfil },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true },
  })

  registrarLog({
    usuarioId:  session.user.id,
    acao:       'CRIAR',
    entidade:   'USUARIO',
    entidadeId: usuario.id,
    descricao:  `Criou usuário "${usuario.nome}" (${usuario.email}) com perfil ${usuario.perfil}`,
    ip:         extrairIp(req),
  }).catch((e) => console.error('[AuditLog]', e))

  return NextResponse.json(usuario, { status: 201 })
}