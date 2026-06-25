import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { conflitoReservaSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { TipoEvento } from '@prisma/client'
import { transicaoValida } from '@/types'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'confirmar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body  = await req.json()
  const parse = conflitoReservaSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const { reservaId, dataHorarioIds } = parse.data

  try {
    let tituloReserva = ''
    let observacao    = ''

    await prisma.$transaction(async (tx) => {
      const reserva = await tx.solicitacaoReserva.findUniqueOrThrow({
        where:  { id: reservaId },
        select: { status: true, titulo: true },
      })

      tituloReserva = reserva.titulo

      if (!transicaoValida(reserva.status, 'CONFLITO_DE_DATAS')) {
        throw new Error(`Transição inválida: ${reserva.status} → CONFLITO_DE_DATAS`)
      }

      const temSelecaoEspecifica = Array.isArray(dataHorarioIds) && dataHorarioIds.length > 0

      if (temSelecaoEspecifica) {
        const datasDaReserva = await tx.dataHorarioReserva.findMany({
          where:  { reservaId },
          select: { id: true },
        })
        const idsValidos   = new Set(datasDaReserva.map((d) => d.id))
        const idsInvalidos = dataHorarioIds!.filter((id) => !idsValidos.has(id))

        if (idsInvalidos.length > 0) {
          throw new Error(`Data(s) informada(s) não pertencem a esta reserva: ${idsInvalidos.join(', ')}`)
        }

        await tx.dataHorarioReserva.updateMany({
          where: { id: { in: dataHorarioIds } },
          data:  { emConflito: true },
        })

        observacao = `Conflito marcado em ${dataHorarioIds!.length} data(s) específica(s).`
      } else {
        await tx.dataHorarioReserva.updateMany({
          where: { reservaId },
          data:  { emConflito: true },
        })
        observacao = 'Conflito marcado em todas as datas da reserva.'
      }

      await tx.solicitacaoReserva.update({
        where: { id: reservaId },
        data:  { status: 'CONFLITO_DE_DATAS' },
      })

      await tx.historicoTramitacao.create({
        data: {
          reservaId,
          usuarioId:    session.user.id,
          evento:       TipoEvento.CONFLITO_DETECTADO,
          statusAntes:  reserva.status,
          statusDepois: 'CONFLITO_DE_DATAS',
          observacao,
        },
      })
    })

    registrarLog({
      usuarioId:  session.user.id,
      acao:       'MARCAR_CONFLITO',
      entidade:   'RESERVA',
      entidadeId: reservaId,
      descricao:  `Marcou conflito na reserva "${tituloReserva}" — ${observacao}`,
      metadados:  { dataHorarioIds },
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao marcar conflito'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}