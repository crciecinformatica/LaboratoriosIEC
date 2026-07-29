import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { aprovarSolicitacaoAcessoSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { SolicitacaoAcessoService } from '@/services/solicitacao-acesso.service'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'solicitacoesAcesso', 'aprovar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parse = aprovarSolicitacaoAcessoSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  try {
    const usuario = await SolicitacaoAcessoService.aprovar(id, session.user.id, parse.data.perfil)

    registrarLog({
      usuarioId:  session.user.id,
      acao:       'CRIAR',
      entidade:   'USUARIO',
      entidadeId: usuario.id,
      descricao:  `Aprovou solicitação de acesso e criou usuário "${usuario.nome}" (${usuario.email})`,
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    return NextResponse.json(usuario)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao aprovar solicitação.'
    return NextResponse.json({ error: msg }, { status: 409 })
  }
}