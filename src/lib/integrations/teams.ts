import axios, { isAxiosError } from 'axios'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TipoEvento = 'CRIACAO' | 'CONFIRMACAO' | 'REJEICAO'

export interface TeamsNotificacaoPayload {
  titulo: string
  reservaId: string
  solicitante: string
  professor: string
  modalidade: 'PRESENCIAL' | 'REMOTO' | 'RAS'
  softwares: string
  numeroAlunos: number
  // Novo modelo: dia + horaInicio + horaFim
  datas: { dia: Date; horaInicio: string; horaFim: string }[]
  evento: TipoEvento

  curso?: string
  disciplina?: string
  codigoDisciplina?: string
  semestre?:string
  turma?: string
  numOferta?: string

  laboratorio?: string
  motivoRejeicao?: string
  cscProtocolo?: string
}

export class TeamsWebhookError extends Error {
  constructor(
    message: string,
    public statusHttp?: number,
    public responseBody?: unknown
  ) {
    super(message)
    this.name = 'TeamsWebhookError'
  }
}

// ─── Formatação ───────────────────────────────────────────────────────────────

/**
 * Formata uma data no padrão "DD/MM/YYYY"
 */
function formatarDia(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/**
 * Monta a linha de data no formato: "DD/MM/YYYY, HH:MM > HH:MM"
 */
function formatarLinhaDatas(datas: TeamsNotificacaoPayload['datas']): string[] {
  return datas.map((d) => `• ${formatarDia(d.dia)}, ${d.horaInicio} > ${d.horaFim}`)
}

// ─── Adaptive Card ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CardBody = any[]

function construirAdaptiveCard(payload: TeamsNotificacaoPayload): object {
  const { evento } = payload

  const configs = {
    CRIACAO: {
      color: 'warning',
      emoji: '🔵',
      titulo: 'Nova solicitação de reserva',
    },
    CONFIRMACAO: {
      color: 'good',
      emoji: '✅',
      titulo: 'Reserva confirmada',
    },
    REJEICAO: {
      color: 'attention',
      emoji: '❌',
      titulo: 'Reserva rejeitada',
    },
  } as const

  const { color, emoji, titulo } = configs[evento]

  const softwaresList = payload.softwares
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const softwaresTexto =
    softwaresList.length === 0
      ? 'N/A'
      : softwaresList.join(', ')

  const linhasDatas = formatarLinhaDatas(payload.datas)

  const body: CardBody = [
    // Cabeçalho
    {
      type: 'Container',
      style: 'emphasis',
      items: [
        {
          type: 'TextBlock',
          text: `${emoji} ${titulo}`,
          size: 'Large',
          weight: 'Bolder',
          color,
        },
      ],
    },

    // Título
    {
      type: 'TextBlock',
      text: payload.titulo + ' - ' + payload.semestre,
      size: 'Medium',
      weight: 'Bolder',
      wrap: true,
      separator: true,
    },

    // Dados da solicitação
    {
      type: 'Container',
      separator: true,
      items: [
        {
          type: 'TextBlock',
          text: 'Dados da solicitação',
          weight: 'Bolder',
          size: 'Medium',
        },

        {
          type: 'ColumnSet',
          columns: [
            {
              type: 'Column',
              width: 'stretch',
              items: [
                {
                  type: 'TextBlock',
                  text: 'Modalidade',
                  isSubtle: true,
                  size: 'Small',
                },
                {
                  type: 'TextBlock',
                  text: payload.modalidade,
                  wrap: true,
                },

                {
                  type: 'TextBlock',
                  text: 'Curso',
                  isSubtle: true,
                  size: 'Small',
                  spacing: 'Medium',
                },
                {
                  type: 'TextBlock',
                  text: payload.curso || '-',
                  wrap: true,
                },

                {
                  type: 'TextBlock',
                  text: 'Disciplina',
                  isSubtle: true,
                  size: 'Small',
                  spacing: 'Medium',
                },
                {
                  type: 'TextBlock',
                  text: payload.disciplina + ' - ' + payload.codigoDisciplina,
                  wrap: true,
                },

                {
                  type: 'TextBlock',
                  text: 'Softwares',
                  isSubtle: true,
                  size: 'Small',
                  spacing: 'Medium',
                },
                {
                  type: 'TextBlock',
                  text: softwaresTexto,
                  wrap: true,
                },

                {
                  type: 'TextBlock',
                  text: 'Solicitante',
                  isSubtle: true,
                  size: 'Small',
                  spacing: 'Medium',
                },
                {
                  type: 'TextBlock',
                  text: payload.solicitante,
                  wrap: true,
                },
              ],
            },

            {
              type: 'Column',
              width: 'stretch',
              items: [
                {
                  type: 'TextBlock',
                  text: 'Professor',
                  isSubtle: true,
                  size: 'Small',
                },
                {
                  type: 'TextBlock',
                  text: payload.professor,
                  wrap: true,
                },

                {
                  type: 'TextBlock',
                  text: 'Oferta / Turma',
                  isSubtle: true,
                  size: 'Small',
                  spacing: 'Medium',
                },
                {
                  type: 'TextBlock',
                  text: `${payload.numOferta ?? '-'} / ${payload.turma ?? '-'}`,
                  wrap: true,
                },

                {
                  type: 'TextBlock',
                  text: 'Nº alunos',
                  isSubtle: true,
                  size: 'Small',
                  spacing: 'Medium',
                },
                {
                  type: 'TextBlock',
                  text: String(payload.numeroAlunos),
                },

                ...(payload.cscProtocolo
                  ? [
                      {
                        type: 'TextBlock',
                        text: 'Protocolo CSC',
                        isSubtle: true,
                        size: 'Small',
                        spacing: 'Medium',
                      },
                      {
                        type: 'TextBlock',
                        text: `#${payload.cscProtocolo}`,
                        weight: 'Bolder',
                        size: 'Medium',
                        color: 'Good',
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
      ],
    },

    // Datas
    {
      type: 'Container',
      separator: true,
      style: 'emphasis',
      items: [
        {
          type: 'TextBlock',
          text: '🗓 Horário solicitado',
          weight: 'Bolder',
        },

        ...linhasDatas.map((linha) => ({
          type: 'TextBlock',
          text: linha,
          wrap: true,
        })),
      ],
    },
  ]

  if (payload.laboratorio) {
    body.push({
      type: 'TextBlock',
      text: `Laboratório: ${payload.laboratorio}`,
      separator: true,
      wrap: true,
      weight: 'Bolder',
    })
  }

  if (evento === 'REJEICAO' && payload.motivoRejeicao) {
    body.push({
      type: 'TextBlock',
      text: `Motivo da rejeição: ${payload.motivoRejeicao}`,
      wrap: true,
      color: 'Attention',
      separator: true,
    })
  }

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body,
  }
}

// ─── Cliente ──────────────────────────────────────────────────────────────────

const clienteTeams = axios.create({ timeout: 10000 })

/**
 * Envia notificação ao Teams via Workflow Webhook.
 * Apenas eventos CRIACAO são enviados (conforme regra de negócio).
 * @throws TeamsWebhookError em caso de falha
 */
export async function notificarTeams(payload: TeamsNotificacaoPayload): Promise<void> {
  if (payload.evento !== 'CRIACAO') {
    console.log(`[Teams] Evento ${payload.evento} ignorado — apenas CRIACAO é notificado`)
    return
  }

  const webhookUrl = process.env.TEAMS_WEBHOOK_URL
  if (!webhookUrl) {
    throw new TeamsWebhookError('TEAMS_WEBHOOK_URL não configurada no ambiente')
  }

  const card = construirAdaptiveCard(payload)

  const body = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: card,
      },
    ],
  }

  try {
    await clienteTeams.post(webhookUrl, body)
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      throw new TeamsWebhookError(
        `Teams retornou erro HTTP ${err.response.status}: ${err.message}`,
        err.response.status,
        err.response.data
      )
    }
    if (isAxiosError(err)) {
      throw new TeamsWebhookError(
        `Erro ao chamar Teams (rede/timeout): ${err.message}`,
        undefined,
        err.message
      )
    }
    throw new TeamsWebhookError(
      `Erro desconhecido ao chamar Teams: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      err
    )
  }
}