import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import { Perfil } from '@prisma/client'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const { pathname } = req.nextUrl

    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const perfil = token.perfil as Perfil

    // Somente ADMINISTRADOR acessa gestão de usuários
    if (pathname.startsWith('/usuarios') && perfil !== 'ADMINISTRADOR') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    // Nova reserva: Apoio Acadêmico e Administrador
    if (pathname.startsWith('/reservas/nova') && !(['APOIO_ACADEMICO', 'ADMINISTRADOR'] as Perfil[]).includes(perfil)) {
      return NextResponse.redirect(new URL('/reservas', req.url))
    }

    // Kanban: somente operador
    if (pathname.startsWith('/kanban') && !(['OPERADOR_TI', 'ADMINISTRADOR'] as Perfil[]).includes(perfil)) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    // APIs restritas ao operador
    const rotasOperador = ['/api/reservas/confirmar', '/api/reservas/rejeitar', '/api/reservas/conflito', '/api/reservas/reagendar', '/api/reservas/kanban', '/api/integracoes']
    if (rotasOperador.some((r) => pathname.startsWith(r))) {
      if (!(['OPERADOR_TI', 'ADMINISTRADOR'] as Perfil[]).includes(perfil)) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
      }
    }

    return NextResponse.next()
  },
  { callbacks: { authorized: ({ token }) => !!token } }
)

export const config = {
  // api/solicitacoes-acesso fica fora do matcher porque o POST de criação é público
  // api/webhooks fica fora para que autenticação via Bearer token passe sem ser barrada pelo NextAuth
  matcher: ['/((?!login|api/auth|api/solicitacoes-acesso|api/webhooks|_next/static|_next/image|favicon.ico).*)'],
}