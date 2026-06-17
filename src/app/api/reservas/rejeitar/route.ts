import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { ReservaService } from '@/services/reserva.service'
import { IntegracoesService } from '@/services/integracao.service'
import { GoogleCalendarService, GoogleCalendarError } from '@/services/google-calendar.service'
import { rejeitarReservaActionSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

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

  try {
    // 1. Rejeita no banco (transação interna do ReservaService)
    await ReservaService.rejeitar(reservaId, { motivoRejeicao }, session.user.id)

    // ─── Remove evento do Google Calendar ───────────────────────────────────────
    // O calendarId é resolvido internamente a partir de laboratorio.googleCalendarId.
    // Executado após commit do rejeitar — falha não reverte a rejeição.
    GoogleCalendarService.deletarEventoReserva(reservaId, session.user.id)
      .catch((err: unknown) => {
        if (err instanceof GoogleCalendarError) {
          console.error('[Sprint6] Falha Google Calendar (rejeitar):', err.message)
        } else {
          console.error('[Sprint6] Erro inesperado Google Calendar:', err)
        }
      })

    // 2. Notificação Teams em background
    IntegracoesService.notificarRejeicao(reservaId, motivoRejeicao)
      .catch((err) => console.error('[Sprint5] Falha notificarRejeicao:', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao rejeitar reserva'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
