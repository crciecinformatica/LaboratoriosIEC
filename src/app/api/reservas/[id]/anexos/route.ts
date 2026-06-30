import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { temPermissao } from '@/lib/auth/rbac'
import { AnexoService } from '@/services/anexo.service'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const reserva = await prisma.solicitacaoReserva.findUnique({
    where: { id },
    select: { solicitanteId: true },
  })
  if (!reserva) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  if (
    session.user.perfil === 'APOIO_ACADEMICO' &&
    reserva.solicitanteId !== session.user.id
  ) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const anexos = await AnexoService.listar(id)
  return NextResponse.json(anexos)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'reservas', 'criar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const reserva = await prisma.solicitacaoReserva.findUnique({
    where: { id },
    select: { solicitanteId: true, titulo: true },
  })
  if (!reserva) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  if (reserva.solicitanteId !== session.user.id && session.user.perfil !== 'ADMINISTRADOR') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 422 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const anexo = await AnexoService.upload(
      id,
      buffer,
      file.name,
      file.type || 'application/octet-stream',
      file.size
    )

    registrarLog({
      usuarioId:  session.user.id,
      acao:       'UPLOAD_ANEXO',
      entidade:   'RESERVA',
      entidadeId: id,
      descricao:  `Enviou anexo "${file.name}" na reserva "${reserva.titulo}"`,
      metadados:  { nomeArquivo: file.name, tamanho: file.size, tipo: file.type },
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    return NextResponse.json(anexo, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao enviar anexo'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}