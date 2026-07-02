import nodemailer from 'nodemailer'

export class OutlookEmailError extends Error {
  constructor(message: string, public response?: unknown) {
    super(message)
    this.name = 'OutlookEmailError'
  }
}

interface SendOutlookEmailParams {
  to: string[]
  subject: string
  text: string
  html?: string
  cc?: string[]
}

function getEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new OutlookEmailError(`Variável de ambiente ${name} não configurada.`)
  }
  return value
}

function parseRecipients(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((recipient) => recipient.trim())
    .filter(Boolean)
}

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter

  const host = getEnvVar('OUTLOOK_SMTP_HOST')
  const port = parseInt(getEnvVar('OUTLOOK_SMTP_PORT'), 10)
  const user = getEnvVar('OUTLOOK_SMTP_USER')
  const pass = getEnvVar('OUTLOOK_SMTP_PASS')

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  })

  return transporter
}

export async function sendOutlookEmail(params: SendOutlookEmailParams): Promise<void> {
  const from = getEnvVar('OUTLOOK_FROM_EMAIL')
  const recipients = params.to
  const cc = params.cc ?? []

  if (recipients.length === 0) {
    throw new OutlookEmailError('Nenhum destinatário configurado para envio de email.')
  }

  try {
    await getTransporter().sendMail({
      from,
      to: recipients.join(', '),
      cc: cc.length > 0 ? cc.join(', ') : undefined,
      subject: params.subject,
      text: params.text,
      html: params.html,
    })
  } catch (error) {
    throw new OutlookEmailError(
      `Falha ao enviar email pelo Outlook: ${error instanceof Error ? error.message : String(error)}`,
      error
    )
  }
}
