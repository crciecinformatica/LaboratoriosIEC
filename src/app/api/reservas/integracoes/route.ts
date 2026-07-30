import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { IntegracoesService } from '@/services/integracao.service'
import { temPermissao } from '@/lib/auth/rbac'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'
import { prisma } from '@/lib/prisma/client'
import { z } from 'zod'

const schema = z.object({
  reservaId: z.string().cuid(),
  flexfieldDestino: z.string().min(1, 'Selecione uma fila'),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Apenas quem pode "confirmar" ou criar pode disparar integrações (Operador/Admin)
  if (!temPermissao(session.user.perfil, 'reservas', 'confirmar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const parse = schema.safeParse(body)

    if (!parse.success) {
      return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
    }

    const { reservaId, flexfieldDestino } = parse.data

    const reserva = await prisma.solicitacaoReserva.findUnique({
      where: { id: reservaId },
      select: { cscProtocolo: true, status: true, titulo: true },
    })

    if (!reserva) {
      return NextResponse.json({ error: 'Reserva não encontrada' }, { status: 404 })
    }

    if (reserva.status !== 'AGUARDANDO_CONFIRMACAO') {
      return NextResponse.json({ error: 'Integrações só podem ser disparadas para reservas aguardando confirmação' }, { status: 400 })
    }

    if (reserva.cscProtocolo) {
      return NextResponse.json({ error: 'Chamado CSC já foi aberto para esta reserva' }, { status: 400 })
    }

    const fila = await prisma.filaChamado.findUnique({
      where: { flexfield: flexfieldDestino }
    })

    if (!fila) {
      return NextResponse.json({ error: 'Fila informada não existe' }, { status: 400 })
    }

    // Chama o serviço (síncrono, aguardando resposta do CSC)
    await IntegracoesService.notificarCriacao(reservaId, session.user.id, flexfieldDestino, fila.disparaTeams)

    // Log de auditoria
    registrarLog({
      usuarioId:  session.user.id,
      acao:       'EDITAR',
      entidade:   'RESERVA',
      entidadeId: reservaId,
      descricao:  `Disparou manualmente integrações (CSC/Teams) para a reserva "${reserva.titulo}"`,
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    return NextResponse.json({ sucesso: true }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao disparar integrações'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
