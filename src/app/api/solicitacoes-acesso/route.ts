import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { solicitarAcessoSchema } from '@/lib/validations/reserva'
import { temPermissao } from '@/lib/auth/rbac'
import { SolicitacaoAcessoService } from '@/services/solicitacao-acesso.service'

// POST é público: uma pessoa sem conta ainda não tem sessão para se autenticar.
// A rota é excluída do middleware (ver src/middleware.ts) por esse motivo.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const parse = solicitarAcessoSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json({ error: 'Dados inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  try {
    const solicitacao = await SolicitacaoAcessoService.solicitar(parse.data)
    return NextResponse.json(solicitacao, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao enviar solicitação de acesso.'
    // Mensagens de conflito (email já cadastrado / solicitação já pendente) usam 409;
    // evitamos detalhar demais para não facilitar enumeração de contas.
    return NextResponse.json({ error: msg }, { status: 409 })
  }
}

// GET é restrito a ADMINISTRADOR — protegido explicitamente aqui, já que a rota
// como um todo está fora do middleware para permitir o POST público acima.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!temPermissao(session.user.perfil, 'solicitacoesAcesso', 'listar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const solicitacoes = await SolicitacaoAcessoService.listarPendentes()
  return NextResponse.json({ solicitacoes, total: solicitacoes.length })
}