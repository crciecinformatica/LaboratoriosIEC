/**
 * Testes para o módulo de integração Outlook (Power Automate)
 *
 * Cobre:
 * - Sucesso (HTTP 200)
 * - Falha HTTP (4xx/5xx)
 * - Timeout (AbortError)
 * - Ausência de destinatários
 * - Variável de ambiente não configurada
 */

// ─── Mocks declarados ANTES dos imports (hoisting do Jest) ───────────────────

// Mock de fetch global
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock de variáveis de ambiente
const originalEnv = process.env

jest.mock('@/lib/integrations/outlook', () => {
  // Importamos o módulo real para testar a lógica real
  return jest.requireActual('@/lib/integrations/outlook')
})

// ─── Imports (após os mocks) ──────────────────────────────────────────────────

import {
  sendOutlookEmail,
  OutlookEmailError,
  type FluxoEmail,
  type SendOutlookEmailParams,
} from '@/lib/integrations/outlook'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParams(overrides: Partial<SendOutlookEmailParams> = {}): SendOutlookEmailParams {
  return {
    flow: 'CONFIRMACAO',
    to: ['test@example.com'],
    subject: 'Test Subject',
    text: 'Test body',
    ...overrides,
  }
}

function mockFetchSuccess() {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve('OK'),
  })
}

function mockFetchFailure(status: number, body: string) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  })
}

function mockFetchTimeout() {
  mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
}

function mockFetchNetworkError() {
  mockFetch.mockRejectedValue(new Error('Network error'))
}

// ─── Testes ────────────────────────────────────────────────────────────────────

describe('sendOutlookEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
    // Reset environment
    process.env = { ...originalEnv }
    // Set required env vars for tests
    process.env.POWER_AUTOMATE_EMAIL_CONFIRMACAO_URL = 'https://flow.example.com/confirmacao'
    process.env.POWER_AUTOMATE_EMAIL_REJEICAO_URL = 'https://flow.example.com/rejeicao'
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('Sucesso', () => {
    it('deve enviar email com sucesso (HTTP 200)', async () => {
      mockFetchSuccess()

      await expect(sendOutlookEmail(makeParams())).resolves.toBeUndefined()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://flow.example.com/confirmacao',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('test@example.com'),
        })
      )
    })

    it('deve enviar email com CC e dados adicionais', async () => {
      mockFetchSuccess()

      const params = makeParams({
        cc: ['cc@example.com'],
        reservaId: '123',
        customField: 'value',
      })

      await expect(sendOutlookEmail(params)).resolves.toBeUndefined()

      const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(callBody.cc).toEqual(['cc@example.com'])
      expect(callBody.reservaId).toBe('123')
      expect(callBody.customField).toBe('value')
    })

    it('deve usar URL de REJEICAO quando flow é REJEICAO', async () => {
      mockFetchSuccess()

      await expect(sendOutlookEmail(makeParams({ flow: 'REJEICAO' }))).resolves.toBeUndefined()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://flow.example.com/rejeicao',
        expect.any(Object)
      )
    })
  })

  describe('Falha: Ausência de destinatários', () => {
    it('deve lançar OutlookEmailError quando array to está vazio', async () => {
      await expect(sendOutlookEmail(makeParams({ to: [] }))).rejects.toThrow(OutlookEmailError)
      await expect(sendOutlookEmail(makeParams({ to: [] }))).rejects.toThrow(
        'Nenhum destinatário configurado para envio de email.'
      )

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Falha: Variável de ambiente não configurada', () => {
    it('deve lançar OutlookEmailError quando POWER_AUTOMATE_EMAIL_CONFIRMACAO_URL não está definida', async () => {
      delete process.env.POWER_AUTOMATE_EMAIL_CONFIRMACAO_URL

      await expect(sendOutlookEmail(makeParams({ flow: 'CONFIRMACAO' }))).rejects.toThrow(
        OutlookEmailError
      )
      await expect(sendOutlookEmail(makeParams({ flow: 'CONFIRMACAO' }))).rejects.toThrow(
        'Variável de ambiente POWER_AUTOMATE_EMAIL_CONFIRMACAO_URL não configurada.'
      )

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('deve lançar OutlookEmailError quando POWER_AUTOMATE_EMAIL_REJEICAO_URL não está definida', async () => {
      delete process.env.POWER_AUTOMATE_EMAIL_REJEICAO_URL

      await expect(sendOutlookEmail(makeParams({ flow: 'REJEICAO' }))).rejects.toThrow(
        OutlookEmailError
      )
      await expect(sendOutlookEmail(makeParams({ flow: 'REJEICAO' }))).rejects.toThrow(
        'Variável de ambiente POWER_AUTOMATE_EMAIL_REJEICAO_URL não configurada.'
      )

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Falha: HTTP Error (4xx/5xx)', () => {
    it('deve lançar OutlookEmailError com status e body no erro 400', async () => {
      mockFetchFailure(400, 'Bad Request: invalid payload')

      await expect(sendOutlookEmail(makeParams())).rejects.toThrow(OutlookEmailError)
      await expect(sendOutlookEmail(makeParams())).rejects.toThrow(
        'Falha ao enviar email via Power Automate (400): Bad Request: invalid payload'
      )

      try {
        await sendOutlookEmail(makeParams())
      } catch (error) {
        expect(error).toBeInstanceOf(OutlookEmailError)
        const outlookError = error as OutlookEmailError
        expect(outlookError.response).toEqual({ status: 400, body: 'Bad Request: invalid payload' })
      }
    })

    it('deve lançar OutlookEmailError com status e body no erro 500', async () => {
      mockFetchFailure(500, 'Internal Server Error')

      await expect(sendOutlookEmail(makeParams())).rejects.toThrow(OutlookEmailError)

      try {
        await sendOutlookEmail(makeParams())
      } catch (error) {
        const outlookError = error as OutlookEmailError
        expect(outlookError.response).toEqual({ status: 500, body: 'Internal Server Error' })
      }
    })

    it('deve lidar com resposta sem body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve(''),
      })

      await expect(sendOutlookEmail(makeParams())).rejects.toThrow(
        'Falha ao enviar email via Power Automate (404): '
      )
    })
  })

  describe('Falha: Timeout', () => {
    it('deve lançar OutlookErrorError com mensagem de timeout quando AbortError', async () => {
      mockFetchTimeout()

      await expect(sendOutlookEmail(makeParams())).rejects.toThrow(OutlookEmailError)
      await expect(sendOutlookEmail(makeParams())).rejects.toThrow(
        'Timeout ao enviar email via Power Automate (15s).'
      )
    })
  })

  describe('Falha: Erro de rede', () => {
    it('deve lançar OutlookErrorError com mensagem do erro de rede', async () => {
      mockFetchNetworkError()

      await expect(sendOutlookEmail(makeParams())).rejects.toThrow(OutlookEmailError)
      await expect(sendOutlookEmail(makeParams())).rejects.toThrow(
        'Falha ao enviar email via Power Automate: Network error'
      )
    })
  })

  describe('OutlookEmailError', () => {
    it('deve manter a assinatura pública compatível (message e response)', () => {
      const error = new OutlookEmailError('Test error', { status: 500, body: 'test' })

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('OutlookEmailError')
      expect(error.response).toEqual({ status: 500, body: 'test' })
    })

    it('deve funcionar sem response opcional', () => {
      const error = new OutlookEmailError('Test error')

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('OutlookEmailError')
      expect(error.response).toBeUndefined()
    })
  })
})