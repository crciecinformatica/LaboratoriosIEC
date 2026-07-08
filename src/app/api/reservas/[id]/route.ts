import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { temPermissao } from '@/lib/auth/rbac'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'
import { GoogleCalendarService, GoogleCalendarError } from '@/services/google-calendar.service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'listar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const reserva = await prisma.solicitacaoReserva.findUnique({
    where: { id },
    include: {
      solicitante: { select: { id: true, nome: true, email: true } },
      professor:   true,
      turma:       true,
      laboratorio: true,
      datas:       { orderBy: { dia: 'asc' } },
      historico: {
        include: { usuario: { select: { id: true, nome: true } } },
        orderBy: { criadoEm: 'asc' },
      },
      anexos: { orderBy: { criadoEm: 'desc' } },
    },
  })

  if (!reserva) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  if (session.user.perfil === 'APOIO_ACADEMICO' && reserva.solicitanteId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  return NextResponse.json(reserva)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'deletar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  // Busca reserva para validação e capturar título para log
  const reserva = await prisma.solicitacaoReserva.findUnique({
    where: { id },
    select: { titulo: true, solicitanteId: true, status: true },
  })

  if (!reserva) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  if (session.user.perfil === 'APOIO_ACADEMICO' && reserva.solicitanteId !== session.user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    // Remove eventos do Google Calendar (fire-and-forget, antes do delete para ter acesso às datas)
    GoogleCalendarService.deletarEventoReserva(id, session.user.id)
      .catch((err: unknown) => {
        if (err instanceof GoogleCalendarError) {
          console.error('[GoogleCalendar] Falha ao deletar eventos da reserva:', err.message)
        } else {
          console.error('[GoogleCalendar] Erro inesperado ao deletar eventos:', err)
        }
      })

    // Exclui a reserva (cascade deleta datas, historico, anexos automaticamente)
    await prisma.solicitacaoReserva.delete({
      where: { id },
    })

    // Log de auditoria (fire-and-forget)
    registrarLog({
      usuarioId:  session.user.id,
      acao:       'EXCLUIR',
      entidade:   'RESERVA',
      entidadeId: id,
      descricao:  `Excluiu reserva "${reserva.titulo}" (status: ${reserva.status})`,
      metadados:  { statusAnterior: reserva.status },
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao excluir reserva'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}