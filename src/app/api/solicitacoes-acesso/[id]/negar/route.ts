import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { negarSolicitacaoAcessoSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { SolicitacaoAcessoService } from '@/services/solicitacao-acesso.service'
import { registrarLog, extrairIp } from '@/lib/audit/log-operacao'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'solicitacoesAcesso', 'negar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parse = negarSolicitacaoAcessoSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  try {
    const solicitacao = await SolicitacaoAcessoService.negar(id, session.user.id, parse.data.motivo)

    registrarLog({
      usuarioId:  session.user.id,
      acao:       'REJEITAR',
      entidade:   'USUARIO',
      entidadeId: solicitacao.id,
      descricao:  `Negou solicitação de acesso de "${solicitacao.nome}" (${solicitacao.email})`,
      ip:         extrairIp(req),
    }).catch((e) => console.error('[AuditLog]', e))

    return NextResponse.json(solicitacao)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao negar solicitação.'
    return NextResponse.json({ error: msg }, { status: 409 })
  }
}