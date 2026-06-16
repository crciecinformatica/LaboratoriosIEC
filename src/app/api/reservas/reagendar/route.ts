import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { ReservaService } from '@/services/reserva.service'
import { GoogleCalendarService, GoogleCalendarError } from '@/services/google-calendar.service'
import { reagendarReservaSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Tanto operadores como o próprio solicitante podem reagendar
  if (!temPermissao(session.user.perfil, 'reservas', 'confirmar') &&
      !temPermissao(session.user.perfil, 'reservas', 'criar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body  = await req.json()
  const parse = reagendarReservaSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const { reservaId, datas } = parse.data

  try {
    // 1. Persiste novas datas + volta para AGUARDANDO_CONFIRMACAO
    await ReservaService.reagendar(reservaId, datas, session.user.id)

    // ─── Fase 3: Atualiza evento no Google Calendar ─────────────────────────────
    // Atualiza/cria o evento com as novas datas após commit do reagendar.
    // Falha não reverte o reagendamento — apenas loga.
    if (process.env.GOOGLE_CALENDAR_ID) {
      GoogleCalendarService.atualizarEventoReserva(reservaId, session.user.id)
        .catch((err: unknown) => {
          if (err instanceof GoogleCalendarError) {
            console.error('[Sprint6] Falha Google Calendar (reagendar):', err.message)
          } else {
            console.error('[Sprint6] Erro inesperado Google Calendar:', err)
          }
        })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao reagendar'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}