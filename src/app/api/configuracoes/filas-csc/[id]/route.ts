import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { editarFilaChamadoSchema } from '@/lib/validations/configuracao'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!['ADMINISTRADOR', 'OPERADOR_TI'].includes(session.user.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = editarFilaChamadoSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  if (parse.data.flexfield) {
    const existe = await prisma.filaChamado.findUnique({ where: { flexfield: parse.data.flexfield } })
    if (existe && existe.id !== params.id) {
      return NextResponse.json({ error: 'Flexfield já em uso' }, { status: 409 })
    }
  }

  try {
    const fila = await prisma.filaChamado.update({
      where: { id: params.id },
      data: parse.data,
    })

    registrarLog({
      usuarioId:  session.user.id,
      acao:       'ATUALIZAR',
      entidade:   'SISTEMA',
      entidadeId: fila.id,
      descricao:  `Atualizou Fila CSC "${fila.nome}" (${fila.flexfield})`,
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    return NextResponse.json(fila)
  } catch (err) {
    return NextResponse.json({ error: 'Fila não encontrada' }, { status: 404 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!['ADMINISTRADOR', 'OPERADOR_TI'].includes(session.user.perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const fila = await prisma.filaChamado.delete({
      where: { id: params.id },
    })

    registrarLog({
      usuarioId:  session.user.id,
      acao:       'EXCLUIR',
      entidade:   'SISTEMA',
      entidadeId: fila.id,
      descricao:  `Excluiu Fila CSC "${fila.nome}"`,
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    return NextResponse.json({ sucesso: true })
  } catch (err) {
    return NextResponse.json({ error: 'Fila não encontrada' }, { status: 404 })
  }
}
