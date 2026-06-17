import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

let _client: OAuth2Client | null = null

/**
 * Um único OAuth2Client autentica TODAS as agendas (uma por laboratório),
 * desde que a conta autenticada tenha acesso de "Fazer alterações e gerenciar
 * compartilhamento" em cada agenda (ver passo a passo no README).
 */
export function getGoogleAuthClient(): OAuth2Client {
  if (_client) return _client

  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Variáveis de ambiente do Google incompletas: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN são obrigatórias.'
    )
  }

  _client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  _client.setCredentials({ refresh_token: refreshToken })

  return _client
}

export function getAuthorizationUrl(): string {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI são obrigatórios.')
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    // calendar (full) já inclui leitura/escrita de eventos + calendarList
    scope: ['https://www.googleapis.com/auth/calendar'],
  })
}
