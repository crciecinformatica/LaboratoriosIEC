import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
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
    // ─── Transação SERIALIZÁVEL para evitar race condition ──────────────────────
    //
    // CORREÇÃO: a detecção de conflito agora recebe `tx` explicitamente, para
    // rodar na MESMA conexão/snapshot da transação. Antes, ConflitosService
    // usava o client Prisma global por padrão — isso fazia a verificação correr
    // fora do isolamento Serializable, competindo pelo pool de conexões com a
    // própria transação aberta, e em loop (1 query por data). O resultado era
    // a transação ultrapassar o timeout padrão de 5000ms do Prisma e fechar
    // antes de chegar no findUniqueOrThrow seguinte — gerando
    // "Transaction already closed: ... query cannot be executed on an expired
    // transaction" e o 500 reportado.
    //
    // Também aumentamos timeout/maxWait como margem de segurança para
    // ambientes mais lentos (ex: dev com poucas conexões no pool).
    await prisma.$transaction(
      async (tx) => {
        const datas = await tx.dataHorarioReserva.findMany({
          where:  { reservaId },
          select: { dia: true, horaInicio: true, horaFim: true },
        })

        if (!datas.length) throw new Error('Reserva sem datas cadastradas')

        // Passa `tx` — a verificação de conflito agora participa da mesma
        // transação/snapshot, em uma única query (ver conflito.service.ts).
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
          select: { status: true },
        })

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
      {
        isolationLevel: 'Serializable',
        // Margem extra de segurança — a lógica em si agora é 1 query rápida,
        // mas mantemos folga para ambientes com latência maior de banco.
        timeout: 10_000, // tempo máximo de execução da transação (ms)
        maxWait: 5_000,  // tempo máximo esperando um slot de conexão livre (ms)
      }
    )

    // ─── Google Calendar (fora da tx) ───────────────────────────────────────────
    // Chamada de rede externa — propositalmente FORA da transação, para nunca
    // contar contra o timeout da transação do banco. O calendarId é resolvido
    // internamente a partir de laboratorio.googleCalendarId.
    GoogleCalendarService.criarEventoReserva(reservaId, session.user.id)
      .catch((err: unknown) => {
        if (err instanceof GoogleCalendarError) {
          console.error('[Sprint6] Falha Google Calendar (confirmar):', err.message)
        } else {
          console.error('[Sprint6] Erro inesperado Google Calendar:', err)
        }
      })

    // ─── Notificação Teams (background) ─────────────────────────────────────────
    IntegracoesService.notificarConfirmacao(reservaId)
      .catch((err) => console.error('[Sprint5] Falha notificarConfirmacao:', err))

    return NextResponse.json({ ok: true })

  } catch (err) {
    if (err instanceof ConflitoError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }

    // P2034 = write conflict / serialization failure do Postgres — sinaliza
    // que outra confirmação simultânea venceu a corrida. Resposta 409 é mais
    // correta que 500 aqui, pois o cliente pode tentar de novo.
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