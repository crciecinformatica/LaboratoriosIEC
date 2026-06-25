import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { GoogleCalendarService, GoogleCalendarError } from '@/services/google-calendar.service'
import { ConflitosService } from '@/services/conflito.service'
import { confirmarReservaActionSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'confirmar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body  = await req.json()
  const parse = confirmarReservaActionSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const { reservaId, laboratorioId } = parse.data

  try {
    let tituloReserva = ''

    await prisma.$transaction(
      async (tx) => {
        const datas = await tx.dataHorarioReserva.findMany({
          where:  { reservaId },
          select: { dia: true, horaInicio: true, horaFim: true },
        })

        if (!datas.length) throw new Error('Reserva sem datas cadastradas')

        const resultado = await ConflitosService.detectarConflitos(laboratorioId, datas, reservaId, tx)

        if (resultado.temConflito) {
          const detalhes = resultado.datasEmConflito
            .map((d) => {
              const dia = new Intl.DateTimeFormat('pt-BR').format(d.dia)
              return `${dia} ${d.horaInicio}–${d.horaFim}${d.reservaConflitante ? ` (conflita com: ${d.reservaConflitante.titulo})` : ''}`
            })
            .join('; ')
          throw new ConflitoError(`Conflito de datas detectado para o laboratório selecionado: ${detalhes}`)
        }

        const reservaAtual = await tx.solicitacaoReserva.findUniqueOrThrow({
          where:  { id: reservaId },
          select: { status: true, titulo: true },
        })

        tituloReserva = reservaAtual.titulo

        await tx.solicitacaoReserva.update({
          where: { id: reservaId },
          data:  { status: 'CONFIRMADA', laboratorioId },
        })

        await tx.historicoTramitacao.create({
          data: {
            reservaId,
            usuarioId:    session.user.id,
            evento:       'CONFIRMACAO' as const,
            statusAntes:  reservaAtual.status,
            statusDepois: 'CONFIRMADA',
          },
        })
      },
      { isolationLevel: 'Serializable', timeout: 10_000, maxWait: 5_000 }
    )

    // Log de auditoria (fire-and-forget, fora da tx)
    registrarLog({
      usuarioId:  session.user.id,
      acao:       'CONFIRMAR',
      entidade:   'RESERVA',
      entidadeId: reservaId,
      descricao:  `Confirmou reserva "${tituloReserva}"`,
      metadados:  { laboratorioId },
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    GoogleCalendarService.criarEventoReserva(reservaId, session.user.id)
      .catch((err: unknown) => {
        if (err instanceof GoogleCalendarError) {
          console.error('[Sprint6] Falha Google Calendar (confirmar):', err.message)
        } else {
          console.error('[Sprint6] Erro inesperado Google Calendar:', err)
        }
      })

    return NextResponse.json({ ok: true })

  } catch (err) {
    if (err instanceof ConflitoError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }

    if (isPrismaSerializationError(err)) {
      return NextResponse.json(
        { error: 'Conflito de concorrência: outra operação alterou esta reserva. Tente novamente.' },
        { status: 409 }
      )
    }

    const msg = err instanceof Error ? err.message : 'Erro ao confirmar reserva'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

class ConflitoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflitoError'
  }
}

function isPrismaSerializationError(err: unknown): boolean {
  return Boolean(
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: string }).code === 'P2034'
  )
}