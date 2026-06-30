import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { ReservaService } from '@/services/reserva.service'
import { GoogleCalendarService, GoogleCalendarError } from '@/services/google-calendar.service'
import { rejeitarReservaActionSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'rejeitar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body  = await req.json()
  const parse = rejeitarReservaActionSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const { reservaId, motivoRejeicao } = parse.data

  // Captura título antes de rejeitar, para usar na descrição do log
  const reserva = await prisma.solicitacaoReserva.findUnique({
    where:  { id: reservaId },
    select: { titulo: true },
  })

  try {
    // 1. Rejeita no banco (transação interna do ReservaService)
    await ReservaService.rejeitar(reservaId, { motivoRejeicao }, session.user.id)

    // Log de auditoria (fire-and-forget, após commit)
    registrarLog({
      usuarioId:  session.user.id,
      acao:       'REJEITAR',
      entidade:   'RESERVA',
      entidadeId: reservaId,
      descricao:  `Rejeitou reserva "${reserva?.titulo ?? reservaId}"`,
      metadados:  { motivoRejeicao },
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    // Remove evento do Google Calendar (mantido). CSC/Teams não são mais
    // notificados em rejeição, por decisão de negócio (só na criação).
    GoogleCalendarService.deletarEventoReserva(reservaId, session.user.id)
      .catch((err: unknown) => {
        if (err instanceof GoogleCalendarError) {
          console.error('[Sprint6] Falha Google Calendar (rejeitar):', err.message)
        } else {
          console.error('[Sprint6] Erro inesperado Google Calendar:', err)
        }
      })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao rejeitar reserva'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}