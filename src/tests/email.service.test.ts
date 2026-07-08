/**
 * Testes para o EmailService
 *
 * Cobre:
 * - sendReservaConfirmacaoEmail: sucesso, falha no envio, falha no registro de log/histórico
 * - sendReservaRejeicaoEmail: sucesso, falha no envio, falha no registro de log/histórico
 * - Funções utilitárias (testadas indiretamente): montarDatasEstruturadas, montarLinhasDatas,
 *   montarEnderecoLaboratorio, montarResumoReserva, montarCorpoConfirmacao, montarCorpoRejeicao,
 *   getDefaultRecipients
 */

// ─── Mocks declarados ANTES dos imports (hoisting do Jest) ───────────────────

jest.mock('@/lib/prisma/client', () => ({
  prisma: {
    solicitacaoReserva: {
      findUniqueOrThrow: jest.fn(),
    },
    historicoTramitacao: {
      create: jest.fn(),
    },
    logIntegracao: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/integrations/outlook', () => ({
  sendOutlookEmail: jest.fn(),
  OutlookEmailError: class OutlookEmailError extends Error {
    constructor(message: string, public response?: unknown) {
      super(message)
      this.name = 'OutlookEmailError'
    }
  },
  FluxoEmail: undefined as unknown,
}))

// ─── Imports (após os mocks) ──────────────────────────────────────────────────

import { EmailService } from '@/services/email.service'
import { prisma } from '@/lib/prisma/client'
import { sendOutlookEmail, OutlookEmailError } from '@/lib/integrations/outlook'
import { TipoEvento } from '@prisma/client'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReserva(overrides: Record<string, unknown> = {}) {
  // Use dates in local timezone to avoid timezone issues in tests
  // Using UTC noon to avoid day shifts in different timezones
  return {
    id: 'res-1',
    titulo: 'Aula de Redes',
    modalidadeReserva: 'PRESENCIAL',
    softwaresUtilizados: 'Wireshark, Docker',
    numeroAlunos: 30,
    solicitante: { nome: 'Maria Silva', email: 'maria@iec.edu.br' },
    professor: { nome: 'Prof. João', email: 'joao@iec.edu.br' },
    turma: {
      codigo: 'SI-2025-1',
      nome: 'Redes de Computadores I',
      curso: 'Sistemas de Informação',
      semestre: '2025/1',
      numOferta: '1',
    },
    laboratorio: {
      nome: 'Lab Redes',
      codigo: 'LAB-01',
      localizacao: 'Bloco A, Sala 101',
    },
    datas: [
      { dia: new Date('2025-08-15T12:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' },
      { dia: new Date('2025-08-22T12:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' },
    ],
    ...overrides,
  }
}

function setupMocks() {
  jest.clearAllMocks()

  // Mock environment
  process.env.OUTLOOK_TO_EMAILS = 'support@iec.edu.br,admin@iec.edu.br'

  // Default successful mocks
  ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
  ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)
  ;(prisma.historicoTramitacao.create as jest.Mock).mockResolvedValue({})
  ;(prisma.logIntegracao.create as jest.Mock).mockResolvedValue({})
}

// ─── Testes ────────────────────────────────────────────────────────────────────

describe('EmailService', () => {
  beforeEach(() => {
    setupMocks()
  })

  describe('sendReservaConfirmacaoEmail', () => {
    it('deve enviar email de confirmação com sucesso', async () => {
          const _reserva = makeReserva()

          await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

          // Verifica carregamento da reserva
          expect(prisma.solicitacaoReserva.findUniqueOrThrow).toHaveBeenCalledWith({
            where: { id: 'res-1' },
            select: expect.any(Object),
          })

          // Verifica chamada do sendOutlookEmail com parâmetros corretos (flat structure)
          expect(sendOutlookEmail).toHaveBeenCalledTimes(1)
          const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
          expect(emailParams.flow).toBe('CONFIRMACAO')
          expect(emailParams.to).toEqual(['support@iec.edu.br', 'admin@iec.edu.br'])
          expect(emailParams.subject).toBe('Reserva confirmada: Aula de Redes')
          expect(emailParams.text).toContain('Reservamos o laboratório Lab Redes')
          expect(emailParams.reservaId).toBe('res-1')
          expect(emailParams.titulo).toBe('Aula de Redes')
          expect(emailParams.laboratorio).toBe('Lab Redes')
          expect(emailParams.endereco).toBe('Bloco A, Sala 101')
          expect(emailParams.professor).toBe('Prof. João')
          expect(emailParams.professorEmail).toBe('joao@iec.edu.br')
          expect(emailParams.turma).toBe('SI-2025-1 — Redes de Computadores I')
          expect(emailParams.curso).toBe('Sistemas de Informação')
          expect(emailParams.semestre).toBe('2025/1')
          expect(emailParams.numeroAlunos).toBe(30)
          expect(emailParams.softwares).toBe('Wireshark, Docker')
          expect(emailParams.solicitante).toBe('Maria Silva')
          expect(emailParams.solicitanteEmail).toBe('maria@iec.edu.br')
          expect(emailParams.datas).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ dia: '15/08/2025', horaInicio: '08:00', horaFim: '10:00' }),
              expect.objectContaining({ dia: '22/08/2025', horaInicio: '08:00', horaFim: '10:00' }),
            ])
          )

          // Verifica registro de histórico
          expect(prisma.historicoTramitacao.create).toHaveBeenCalledWith({
            data: {
              reservaId: 'res-1',
              usuarioId: 'op-1',
              evento: TipoEvento.ENVIO_EMAIL,
              observacao: 'Email de confirmação enviado ao apoio acadêmico.',
            },
          })

          // Verifica registro de log
          expect(prisma.logIntegracao.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
              servico: 'OUTLOOK',
              endpoint: 'power-automate:confirmacao',
              metodo: 'POST',
              statusHttp: 250,
              erro: undefined,
            }),
          })
        })

    it('deve lançar erro e registrar log de falha quando sendOutlookEmail falha', async () => {
      const error = new OutlookEmailError('Falha no envio', { status: 500 })
      ;(sendOutlookEmail as jest.Mock).mockRejectedValue(error)

      await expect(EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')).rejects.toThrow(OutlookEmailError)

      // Verifica que log de erro foi registrado
      expect(prisma.logIntegracao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          servico: 'OUTLOOK',
          endpoint: 'power-automate:confirmacao',
          metodo: 'POST',
          statusHttp: 500,
          erro: 'Falha no envio',
        }),
      })

      // Verifica que histórico NÃO foi criado (porque o erro é lançado antes)
      expect(prisma.historicoTramitacao.create).not.toHaveBeenCalled()
    })

    it('deve lidar com erro genérico (não OutlookEmailError)', async () => {
      ;(sendOutlookEmail as jest.Mock).mockRejectedValue(new Error('Network error'))

      await expect(EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')).rejects.toThrow('Network error')

      expect(prisma.logIntegracao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          erro: 'Error: Network error',
        }),
      })
    })

    it('deve funcionar quando laboratório é null', async () => {
      const reserva = makeReserva({ laboratorio: null })
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.laboratorio).toBeNull()
      expect(emailParams.endereco).toBe('Endereço não informado.')
    })

    it('deve usar numOferta null quando não informado', async () => {
      const reserva = makeReserva({ turma: { ...makeReserva().turma, numOferta: null } })
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.text).toContain('Oferta: —')
    })
  })

  describe('sendReservaRejeicaoEmail', () => {
    it('deve enviar email de rejeição com sucesso', async () => {
      const _reserva = makeReserva()

      await EmailService.sendReservaRejeicaoEmail('res-1', 'op-1', 'Laboratório indisponível')

      // Verifica chamada do sendOutlookEmail com parâmetros corretos (flat structure)
      expect(sendOutlookEmail).toHaveBeenCalledTimes(1)
      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.flow).toBe('REJEICAO')
      expect(emailParams.to).toEqual(['support@iec.edu.br', 'admin@iec.edu.br'])
      expect(emailParams.subject).toBe('Reserva rejeitada: Aula de Redes')
      expect(emailParams.text).toContain('Infelizmente não há laboratórios disponíveis')
      expect(emailParams.text).toContain('Motivo: Laboratório indisponível')
      expect(emailParams.reservaId).toBe('res-1')
      expect(emailParams.titulo).toBe('Aula de Redes')
      expect(emailParams.motivoRejeicao).toBe('Laboratório indisponível')
      expect(emailParams.professor).toBe('Prof. João')
      expect(emailParams.professorEmail).toBe('joao@iec.edu.br')
      expect(emailParams.turma).toBe('SI-2025-1 — Redes de Computadores I')
      expect(emailParams.curso).toBe('Sistemas de Informação')
      expect(emailParams.semestre).toBe('2025/1')
      expect(emailParams.numeroAlunos).toBe(30)
      expect(emailParams.softwares).toBe('Wireshark, Docker')
      expect(emailParams.solicitante).toBe('Maria Silva')
      expect(emailParams.solicitanteEmail).toBe('maria@iec.edu.br')
      expect(emailParams.datas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ dia: '15/08/2025', horaInicio: '08:00', horaFim: '10:00' }),
        ])
      )

      // Verifica registro de histórico
      expect(prisma.historicoTramitacao.create).toHaveBeenCalledWith({
        data: {
          reservaId: 'res-1',
          usuarioId: 'op-1',
          evento: TipoEvento.ENVIO_EMAIL,
          observacao: 'Email de rejeição enviado ao apoio acadêmico.',
        },
      })

      // Verifica registro de log
      expect(prisma.logIntegracao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          servico: 'OUTLOOK',
          endpoint: 'power-automate:rejeicao',
          metodo: 'POST',
          statusHttp: 250,
          erro: undefined,
        }),
      })
    })

    it('deve enviar email de rejeição sem motivo quando não informado', async () => {
      const _reserva = makeReserva()

      await EmailService.sendReservaRejeicaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.motivoRejeicao).toBeNull()
      expect(emailParams.text).not.toContain('Motivo:')
    })

    it('deve lançar erro e registrar log de falha quando sendOutlookEmail falha', async () => {
      const error = new OutlookEmailError('Falha no envio', { status: 503 })
      ;(sendOutlookEmail as jest.Mock).mockRejectedValue(error)

      await expect(EmailService.sendReservaRejeicaoEmail('res-1', 'op-1')).rejects.toThrow(OutlookEmailError)

      expect(prisma.logIntegracao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          servico: 'OUTLOOK',
          endpoint: 'power-automate:rejeicao',
          statusHttp: 500,
          erro: 'Falha no envio',
        }),
      })
    })

    it('deve funcionar quando laboratório é null', async () => {
      const reserva = makeReserva({ laboratorio: null })
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)

      await EmailService.sendReservaRejeicaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      // Rejeição não inclui laboratorio/endereco nos dados
      expect(emailParams).not.toHaveProperty('laboratorio')
      expect(emailParams).not.toHaveProperty('endereco')
    })
  })

  // ─── Testes das funções utilitárias (indiretos via EmailService) ─────────────

  describe('getDefaultRecipients (indireto)', () => {
    it('deve parsear emails separados por vírgula e trim', async () => {
      process.env.OUTLOOK_TO_EMAILS = '  a@b.com , c@d.com , e@f.com  '
      const reserva = makeReserva()
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.to).toEqual(['a@b.com', 'c@d.com', 'e@f.com'])
    })

    it('deve filtrar strings vazias', async () => {
      process.env.OUTLOOK_TO_EMAILS = 'a@b.com,,c@d.com,'
      const reserva = makeReserva()
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.to).toEqual(['a@b.com', 'c@d.com'])
    })
  })

  describe('montarDatasEstruturadas (indireto)', () => {
    it('deve formatar datas corretamente', async () => {
      const reserva = makeReserva({
        datas: [
          { dia: new Date('2025-08-15T12:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' },
          { dia: new Date('2025-08-22T12:00:00.000Z'), horaInicio: '14:00', horaFim: '16:00' },
        ],
      })
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.datas).toEqual([
        { dia: '15/08/2025', horaInicio: '08:00', horaFim: '10:00' },
        { dia: '22/08/2025', horaInicio: '14:00', horaFim: '16:00' },
      ])
    })
  })

  describe('montarLinhasDatas (indireto)', () => {
    it('deve formatar linhas de datas no corpo do texto', async () => {
      const reserva = makeReserva({
        datas: [
          { dia: new Date('2025-08-15T12:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' },
        ],
      })
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.text).toContain('• 15/08/2025 — 08:00 às 10:00')
    })
  })

  describe('montarEnderecoLaboratorio (indireto)', () => {
    it('deve retornar localização quando laboratório tem localizacao', async () => {
      const reserva = makeReserva({
        laboratorio: { nome: 'Lab 1', codigo: 'L1', localizacao: 'Sala 101' },
      })
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.text).toContain('Endereço: Sala 101')
      expect(emailParams.endereco).toBe('Sala 101')
    })

    it('deve retornar "Endereço não informado." quando laboratório não tem localizacao', async () => {
      const reserva = makeReserva({
        laboratorio: { nome: 'Lab 1', codigo: 'L1', localizacao: null },
      })
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.text).toContain('Endereço: Endereço não informado.')
      expect(emailParams.endereco).toBe('Endereço não informado.')
    })

    it('deve retornar "Endereço não informado." quando laboratório é null', async () => {
      const reserva = makeReserva({ laboratorio: null })
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      expect(emailParams.text).toContain('Endereço: Endereço não informado.')
      expect(emailParams.endereco).toBe('Endereço não informado.')
    })
  })

  describe('montarResumoReserva (indireto)', () => {
    it('deve incluir todos os campos do resumo no corpo do email', async () => {
      const reserva = makeReserva()
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      const text = emailParams.text

      expect(text).toContain('Título: Aula de Redes')
      expect(text).toContain('Modalidade: PRESENCIAL')
      expect(text).toContain('Laboratório: Lab Redes')
      expect(text).toContain('Professor: Prof. João')
      expect(text).toContain('E-mail do professor: joao@iec.edu.br')
      expect(text).toContain('Turma: SI-2025-1 — Redes de Computadores I')
      expect(text).toContain('Curso: Sistemas de Informação')
      expect(text).toContain('Semestre: 2025/1')
      expect(text).toContain('Oferta: 1')
      expect(text).toContain('Nº alunos: 30')
      expect(text).toContain('Softwares: Wireshark, Docker')
      expect(text).toContain('Solicitante: Maria Silva (maria@iec.edu.br)')
    })
  })

  describe('montarCorpoConfirmacao (indireto)', () => {
    it('deve gerar corpo completo com saudação, datas, endereço, resumo e despedida', async () => {
      const reserva = makeReserva()
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaConfirmacaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      const text = emailParams.text

      expect(text).toContain('Prezado(a),')
      expect(text).toContain('Reservamos o laboratório Lab Redes')
      expect(text).toContain('• 15/08/2025 — 08:00 às 10:00')
      expect(text).toContain('• 22/08/2025 — 08:00 às 10:00')
      expect(text).toContain('Endereço: Bloco A, Sala 101')
      expect(text).toContain('Atenciosamente,')
      expect(text).toContain('Equipe de Operação de TI')
    })
  })

  describe('montarCorpoRejeicao (indireto)', () => {
    it('deve gerar corpo com motivo quando informado', async () => {
      const reserva = makeReserva()
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaRejeicaoEmail('res-1', 'op-1', 'Conflito de horário')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      const text = emailParams.text

      expect(text).toContain('Prezado(a) ,')
      expect(text).toContain('Infelizmente não há laboratórios disponíveis')
      expect(text).toContain('Motivo: Conflito de horário')
      expect(text).toContain('Solicitação: Aula de Redes')
      expect(text).toContain('Professor: Prof. João')
      expect(text).toContain('Turma: SI-2025-1 — Redes de Computadores I')
      expect(text).toContain('Atenciosamente,')
    })

    it('deve gerar corpo sem motivo quando não informado', async () => {
      const reserva = makeReserva()
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
      ;(sendOutlookEmail as jest.Mock).mockResolvedValue(undefined)

      await EmailService.sendReservaRejeicaoEmail('res-1', 'op-1')

      const emailParams = (sendOutlookEmail as jest.Mock).mock.calls[0][0]
      const text = emailParams.text

      expect(text).not.toContain('Motivo:')
    })
  })
})