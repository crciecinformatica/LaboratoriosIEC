import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { ReservaService } from '@/services/reserva.service'
import { IntegracoesService } from '@/services/integracao.service'
import { rejeitarReservaActionSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'rejeitar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = rejeitarReservaActionSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const { reservaId, motivoRejeicao } = parse.data

  try {
    await ReservaService.rejeitar(reservaId, { motivoRejeicao }, session.user.id)

    // Integração em background
    IntegracoesService.notificarRejeicao(reservaId, motivoRejeicao)
      .catch((err) => console.error('[Sprint5] Falha notificarRejeicao:', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao rejeitar reserva'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
