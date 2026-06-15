import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

let _client: OAuth2Client | null = null

/**
 * Retorna um OAuth2Client já configurado com refresh token.
 * O access token é renovado automaticamente pelo SDK quando expirado.
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

/**
 * Gera a URL para o fluxo OAuth2 inicial (apenas necessário UMA vez para obter o refresh token).
 * Uso: acesse a URL no browser, autorize, e copie o code retornado para /api/google-calendar/oauth/callback.
 */
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
    prompt:      'consent', // força retorno do refresh_token
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  })
}