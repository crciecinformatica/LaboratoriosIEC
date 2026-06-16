import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { ReservaService } from '@/services/reserva.service'
import { IntegracoesService } from '@/services/integracao.service'
import { GoogleCalendarService, GoogleCalendarError } from '@/services/google-calendar.service'
import { ConflitosService } from '@/services/conflito.service'
import { confirmarReservaActionSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

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
    // ─── Fase 8: Transação SERIALIZÁVEL para evitar race condition ──────────────
    // Garante que dois operadores confirmando ao mesmo tempo não causem
    // dupla confirmação no mesmo laboratório/horário.
    await prisma.$transaction(
      async (tx) => {
        // 1. Busca datas dentro da transação (leitura serializada)
        const datas = await tx.dataHorarioReserva.findMany({
          where:  { reservaId },
          select: { dia: true, horaInicio: true, horaFim: true },
        })

        if (!datas.length) {
          throw new Error('Reserva sem datas cadastradas')
        }

        // 2. Verifica conflito com lock implícito do nível Serializable
        const resultado = await ConflitosService.detectarConflitos(
          laboratorioId,
          datas,
          reservaId
        )

        if (resultado.temConflito) {
          const detalhes = resultado.datasEmConflito
            .map((d) => {
              const dia = new Intl.DateTimeFormat('pt-BR').format(d.dia)
              return `${dia} ${d.horaInicio}–${d.horaFim}${d.reservaConflitante ? ` (conflita com: ${d.reservaConflitante.titulo})` : ''}`
            })
            .join('; ')

          throw new ConflitoError(
            `Conflito de datas detectado para o laboratório selecionado: ${detalhes}`
          )
        }

        // 3. Atualiza status + laboratório (dentro da tx serializada)
        await tx.solicitacaoReserva.update({
          where: { id: reservaId },
          data: { status: 'CONFIRMADA', laboratorioId },
        })

        // 4. Registra histórico de confirmação
        const reservaAtual = await tx.solicitacaoReserva.findUniqueOrThrow({
          where:  { id: reservaId },
          select: { status: true },
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
      // Nível Serializable: previne anomalias de leitura phantom e write skew
      { isolationLevel: 'Serializable' }
    )

    // ─── Fase 2: Google Calendar (fora da tx — side effect externo) ────────────
    // Executado após commit da transação principal para não bloquear o lock.
    // Falha no Calendar NÃO reverte a confirmação (notifica mas não falha o request).
    if (process.env.GOOGLE_CALENDAR_ID) {
      GoogleCalendarService.criarEventoReserva(reservaId, session.user.id)
        .catch((err: unknown) => {
          if (err instanceof GoogleCalendarError) {
            console.error('[Sprint6] Falha Google Calendar (confirmar):', err.message)
          } else {
            console.error('[Sprint6] Erro inesperado Google Calendar:', err)
          }
        })
    }

    // ─── Notificação Teams (background, não bloqueia response) ─────────────────
    IntegracoesService.notificarConfirmacao(reservaId)
      .catch((err) => console.error('[Sprint5] Falha notificarConfirmacao:', err))

    return NextResponse.json({ ok: true })

  } catch (err) {
    if (err instanceof ConflitoError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
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