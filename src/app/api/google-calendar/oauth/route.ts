import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

/**
 * Rota usada UMA ÚNICA VEZ para obter o refresh_token do Google OAuth2.
 *
 * Fluxo:
 * 1. Acesse GET /api/google-calendar/oauth  → redireciona para o Google
 * 2. Autorize no browser
 * 3. Google redireciona para /api/google-calendar/oauth/callback?code=...
 * 4. Esta rota troca o code pelo refresh_token e exibe na tela
 * 5. Copie o refresh_token para o .env como GOOGLE_REFRESH_TOKEN
 *
 * ⚠️  Desative ou proteja esta rota em produção após o setup.
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Variáveis GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI não configuradas.' },
      { status: 500 }
    )
  }

  // ── Passo 1: sem code → gera URL de autorização e redireciona ──────────────
  if (!code) {
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt:      'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    })
    return NextResponse.redirect(authUrl)
  }

  // ── Passo 2: troca o code pelo refresh_token ────────────────────────────────
  try {
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
    const { tokens } = await client.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.json(
        {
          error: 'Refresh token não retornado. Revogue o acesso em https://myaccount.google.com/permissions e tente novamente.',
          tokens,
        },
        { status: 400 }
      )
    }

    // Exibe o refresh token para ser copiado para o .env
    return new NextResponse(
      `
      <html>
        <body style="font-family:monospace;padding:2rem;background:#f8f8f8">
          <h2 style="color:#16a34a">✅ Autorização concluída!</h2>
          <p>Copie o <strong>refresh_token</strong> abaixo para o seu <code>.env</code>:</p>
          <pre style="background:#1e293b;color:#86efac;padding:1rem;border-radius:8px;overflow:auto">
GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}
          </pre>
          <p style="color:#64748b">Após adicionar ao .env, reinicie o servidor e esta rota pode ser desativada.</p>
        </body>
      </html>
      `,
      {
        headers: { 'Content-Type': 'text/html' },
      }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Falha ao trocar code: ${msg}` }, { status: 500 })
  }
}