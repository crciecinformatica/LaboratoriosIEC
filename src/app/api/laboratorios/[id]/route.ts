import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { editarLaboratorioSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const lab = await prisma.laboratorio.findUnique({ where: { id } })
  if (!lab) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json(lab)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'laboratorios', 'editar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const parse = editarLaboratorioSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  // Captura estado anterior para o log (diff de campos)
  const anterior = await prisma.laboratorio.findUnique({ where: { id } })

  const lab = await prisma.laboratorio.update({
    where: { id },
    data: parse.data,
  })

  registrarLog({
    usuarioId:  session.user.id,
    acao:       'EDITAR',
    entidade:   'LABORATORIO',
    entidadeId: id,
    descricao:  `Editou laboratório "${lab.nome}" (${lab.codigo})`,
    metadados:  { antes: anterior, depois: lab, camposAlterados: Object.keys(parse.data) },
    ip:         extrairIp(req),
  }).catch((e) => console.error('[AuditLog]', e))

  return NextResponse.json(lab)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'laboratorios', 'deletar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const lab = await prisma.laboratorio.update({
    where: { id },
    data: { ativo: false },
  })

  registrarLog({
    usuarioId:  session.user.id,
    acao:       'EXCLUIR',
    entidade:   'LABORATORIO',
    entidadeId: id,
    descricao:  `Desativou laboratório "${lab.nome}" (${lab.codigo})`,
    ip:         extrairIp(req),
  }).catch((e) => console.error('[AuditLog]', e))

  return new NextResponse(null, { status: 204 })
}