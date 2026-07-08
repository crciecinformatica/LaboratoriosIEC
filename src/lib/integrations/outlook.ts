export class OutlookEmailError extends Error {
  constructor(message: string, public response?: unknown) {
    super(message)
    this.name = 'OutlookEmailError'
  }
}

export type FluxoEmail = 'CONFIRMACAO' | 'REJEICAO'

function getFlowUrl(flow: FluxoEmail): string {
  const envKey =
    flow === 'CONFIRMACAO'
      ? 'POWER_AUTOMATE_EMAIL_CONFIRMACAO_URL'
      : 'POWER_AUTOMATE_EMAIL_REJEICAO_URL'
  const value = process.env[envKey]
  if (!value) {
    throw new OutlookEmailError(`Variável de ambiente ${envKey} não configurada.`)
  }
  return value
}

export interface SendOutlookEmailParams {
  flow: FluxoEmail
  to: string[]
  cc?: string[]
  subject: string
  text: string
  // campos extras do payload (ex: reservaId, titulo, datas, etc.) - serão espalhados no body
  [key: string]: unknown
}

export async function sendOutlookEmail(params: SendOutlookEmailParams): Promise<void> {
  const { flow, to, cc, subject, text, ...rest } = params

  if (to.length === 0) {
    throw new OutlookEmailError('Nenhum destinatário configurado para envio de email.')
  }

  const url = getFlowUrl(flow)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, cc, subject, text, ...rest }),
      signal: controller.signal,
    })

    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      throw new OutlookEmailError(
        `Falha ao enviar email via Power Automate (${resp.status}): ${body}`,
        { status: resp.status, body }
      )
    }
  } catch (error) {
    if (error instanceof OutlookEmailError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new OutlookEmailError('Timeout ao enviar email via Power Automate (15s).')
    }
    throw new OutlookEmailError(
      `Falha ao enviar email via Power Automate: ${error instanceof Error ? error.message : String(error)}`,
      error
    )
  } finally {
    clearTimeout(timeout)
  }
}
