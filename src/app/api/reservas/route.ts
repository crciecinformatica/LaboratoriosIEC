import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { ReservaService } from '@/services/reserva.service'
import { IntegracoesService } from '@/services/integracao.service'
import { criarReservaSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'criar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body  = await req.json()
  const parse = criarReservaSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  try {
    const reserva = await ReservaService.criar(parse.data, session.user.id)

    // Log de auditoria (fire-and-forget)
    registrarLog({
      usuarioId:  session.user.id,
      acao:       'CRIAR',
      entidade:   'RESERVA',
      entidadeId: reserva.id,
      descricao:  `Criou reserva "${reserva.titulo}" com ${reserva.datas.length} data(s)`,
      metadados:  { datas: reserva.datas.length, modalidade: parse.data.modalidadeReserva },
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    // Notificação CSC + Teams (apenas na criação, conforme regra de negócio)
    IntegracoesService.notificarCriacao(reserva.id, session.user.id)
      .catch((err) => console.error('[Sprint5] Falha notificarCriacao:', err))

    return NextResponse.json(reserva, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao criar reserva'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'listar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const page   = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit  = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))

  const where =
    session.user.perfil === 'APOIO_ACADEMICO'
      ? { solicitanteId: session.user.id, ...(status ? { status: status as never } : {}) }
      : { ...(status ? { status: status as never } : {}) }

  const [total, reservas] = await Promise.all([
    prisma.solicitacaoReserva.count({ where }),
    prisma.solicitacaoReserva.findMany({
      where,
      include: {
        solicitante: { select: { id: true, nome: true } },
        professor:   { select: { id: true, nome: true } },
        turma:       { select: { id: true, codigo: true, nome: true } },
        laboratorio: { select: { id: true, nome: true, codigo: true } },
        datas:       { orderBy: { dia: 'asc' } },
      },
      orderBy: { criadoEm: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({ reservas, total, page, limit })
}