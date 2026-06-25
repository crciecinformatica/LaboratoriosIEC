import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { ReservaService } from '@/services/reserva.service'
import { GoogleCalendarService, GoogleCalendarError } from '@/services/google-calendar.service'
import { reagendarReservaSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

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

  const reserva = await prisma.solicitacaoReserva.findUnique({
    where:  { id: reservaId },
    select: { titulo: true },
  })

  try {
    await ReservaService.reagendar(reservaId, datas, session.user.id)

    registrarLog({
      usuarioId:  session.user.id,
      acao:       'REAGENDAR',
      entidade:   'RESERVA',
      entidadeId: reservaId,
      descricao:  `Reagendou reserva "${reserva?.titulo ?? reservaId}" com ${datas.length} data(s)`,
      metadados:  { novasDatas: datas },
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    GoogleCalendarService.atualizarEventoReserva(reservaId, session.user.id)
      .catch((err: unknown) => {
        if (err instanceof GoogleCalendarError) {
          console.error('[Sprint6] Falha Google Calendar (reagendar):', err.message)
        } else {
          console.error('[Sprint6] Erro inesperado Google Calendar:', err)
        }
      })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao reagendar'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}