import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

/**
 * Rota usada UMA ÚNICA VEZ para obter o refresh_token do Google OAuth2.
 *
 * Fluxo:
 * 1. Acesse GET /api/google-calendar/oauth  → redireciona para o Google
 * 2. Autorize no browser com a conta institucional (a mesma que tem acesso
 *    às agendas de cada laboratório, ex: "Prédio 1 - Lab 505 (24)")
 * 3. Google redireciona de volta com ?code=...
 * 4. Esta rota troca o code pelo refresh_token e já lista as agendas
 *    disponíveis para facilitar o mapeamento posterior
 * 5. Copie o refresh_token para o .env como GOOGLE_REFRESH_TOKEN
 * 6. Use scripts/listar-agendas-google.ts ou a lista exibida aqui para
 *    mapear cada Laboratorio.googleCalendarId
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

  if (!code) {
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt:      'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
    })
    return NextResponse.redirect(authUrl)
  }

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

    // Lista as agendas já autorizadas para facilitar o próximo passo (mapeamento)
    client.setCredentials(tokens)
    const calendar = google.calendar({ version: 'v3', auth: client })
    const { data } = await calendar.calendarList.list({ maxResults: 250 })
    const agendas = data.items ?? []

    const linhasAgendas = agendas
      .map((a) => `<tr><td style="padding:4px 12px">${a.summary}</td><td style="padding:4px 12px;font-family:monospace;color:#475569">${a.id}</td></tr>`)
      .join('')

    return new NextResponse(
      `
      <html>
        <body style="font-family:system-ui;padding:2rem;background:#f8f8f8;max-width:900px;margin:0 auto">
          <h2 style="color:#16a34a">✅ Autorização concluída!</h2>
          <p>1. Copie o <strong>refresh_token</strong> abaixo para o seu <code>.env</code>:</p>
          <pre style="background:#1e293b;color:#86efac;padding:1rem;border-radius:8px;overflow:auto">
GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}
          </pre>

          <p>2. Agendas encontradas nesta conta (use o calendarId para vincular cada laboratório):</p>
          <table style="width:100%;background:white;border-radius:8px;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f1f5f9;text-align:left">
                <th style="padding:6px 12px">Nome da agenda</th>
                <th style="padding:6px 12px">Calendar ID</th>
              </tr>
            </thead>
            <tbody>${linhasAgendas}</tbody>
          </table>

          <p style="color:#64748b;margin-top:1.5rem">
            3. Rode <code>npx tsx scripts/vincular-calendario-laboratorio.ts &lt;laboratorioId&gt; &lt;calendarId&gt;</code>
            para cada laboratório. Após concluir, esta rota pode ser desativada.
          </p>
        </body>
      </html>
      `,
      { headers: { 'Content-Type': 'text/html' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Falha ao trocar code: ${msg}` }, { status: 500 })
  }
}
