/**
 * Testes do IntegracoesService (CSC + Teams)
 * CORREÇÃO: convertido de Vitest (vi.fn, vi.mock) → Jest (jest.fn, jest.mock)
 *
 * Roda com: npx jest src/tests/integracao.service.test.ts
 */

// ─── Mocks declarados ANTES dos imports (hoisting do Jest) ───────────────────

jest.mock('@/lib/prisma/client', () => ({
  prisma: {
    solicitacaoReserva: {
      findUniqueOrThrow: jest.fn(),
      update:            jest.fn(),
    },
    usuario: {
      findUniqueOrThrow: jest.fn(),
    },
    historicoTramitacao: {
      create:    jest.fn(),
      findFirst: jest.fn(),
    },
    logIntegracao: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/integrations/csc', () => ({
  abrirChamadoCSC: jest.fn(),
  CscApiError: class CscApiError extends Error {
    statusHttp: number | undefined
    responseBody: unknown
    constructor(message: string, statusHttp?: number, responseBody?: unknown) {
      super(message)
      this.name = 'CscApiError'
      this.statusHttp  = statusHttp
      this.responseBody = responseBody
    }
  },
}))

jest.mock('@/lib/integrations/teams', () => ({
  notificarTeams: jest.fn(),
  TeamsWebhookError: class TeamsWebhookError extends Error {
    statusHttp: number | undefined
    responseBody: unknown
    constructor(message: string, statusHttp?: number, responseBody?: unknown) {
      super(message)
      this.name = 'TeamsWebhookError'
      this.statusHttp   = statusHttp
      this.responseBody = responseBody
    }
  },
}))

// ─── Imports (após os mocks) ──────────────────────────────────────────────────

import { IntegracoesService } from '@/services/integracao.service'
import { prisma } from '@/lib/prisma/client'
import * as cscModule   from '@/lib/integrations/csc'
import * as teamsModule from '@/lib/integrations/teams'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReserva(overrides: Record<string, unknown> = {}) {
  return {
    id:                  'res-1',
    modalidadeReserva:   'PRESENCIAL',
    titulo:              'Aula de Redes',
    softwaresUtilizados: 'Wireshark',
    numeroAlunos:        30,
    solicitante: { id: 'u1', nome: 'Maria', email: 'maria@iec.edu.br' },
    professor:   { id: 'p1', nome: 'Prof. Silva', email: 'silva@iec.edu.br', telefone: null, departamento: null },
    turma:       { id: 't1', codigo: 'SI-2025-1', nome: 'Redes I', curso: 'Sistemas', codigoDisciplina: 'D1', semestre: '2025/1', numOferta: null },
    laboratorio: null,
    datas: [
      { dia: new Date('2025-08-15T00:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' },
    ],
    ...overrides,
  }
}

// ─── notificarCriacao ─────────────────────────────────────────────────────────

describe('IntegracoesService.notificarCriacao', () => {
  beforeEach(() => jest.clearAllMocks())

  it('não chama CSC nem Teams para modalidade REMOTO', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue(makeReserva({ modalidadeReserva: 'REMOTO' }))

    await IntegracoesService.notificarCriacao('res-1', 'op-1')

    expect(cscModule.abrirChamadoCSC).not.toHaveBeenCalled()
    expect(teamsModule.notificarTeams).not.toHaveBeenCalled()
  })

  it('não chama CSC nem Teams para modalidade RAS', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue(makeReserva({ modalidadeReserva: 'RAS' }))

    await IntegracoesService.notificarCriacao('res-1', 'op-1')

    expect(cscModule.abrirChamadoCSC).not.toHaveBeenCalled()
    expect(teamsModule.notificarTeams).not.toHaveBeenCalled()
  })

  it('lança erro se operador não tem codigoPessoa', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
    ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: null })

    await expect(IntegracoesService.notificarCriacao('res-1', 'op-1'))
      .rejects.toThrow()
  })

  it('CSC sucesso: salva protocolo, cria histórico e log, depois notifica Teams', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
    ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: '288319' })
    ;(cscModule.abrirChamadoCSC as jest.Mock).mockResolvedValue({ protocolo: 'CSC-001', raw: {} })
    ;(teamsModule.notificarTeams as jest.Mock).mockResolvedValue(undefined)

    await IntegracoesService.notificarCriacao('res-1', 'op-1')

    expect(prisma.solicitacaoReserva.update).toHaveBeenCalledWith({
      where: { id: 'res-1' },
      data:  { cscProtocolo: 'CSC-001' },
    })
    expect(prisma.historicoTramitacao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ evento: 'ENVIO_CSC' }) })
    )
    expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ servico: 'CSC', statusHttp: 200 }) })
    )
    expect(teamsModule.notificarTeams).toHaveBeenCalled()
  })

  it('CSC erro: cria log com erro e propaga exceção', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
    ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: '288319' })
    ;(cscModule.abrirChamadoCSC as jest.Mock).mockRejectedValue(
      new cscModule.CscApiError('CSC indisponível', 503)
    )

    await expect(IntegracoesService.notificarCriacao('res-1', 'op-1')).rejects.toThrow()

    expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          servico:   'CSC',
          statusHttp: 503,
          erro:      expect.stringContaining('CSC indisponível'),
        }),
      })
    )
    expect(teamsModule.notificarTeams).not.toHaveBeenCalled()
  })

  it('Teams erro: cria log mas NÃO propaga a exceção', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
    ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: '288319' })
    ;(cscModule.abrirChamadoCSC as jest.Mock).mockResolvedValue({ protocolo: 'CSC-002', raw: {} })
    ;(teamsModule.notificarTeams as jest.Mock).mockRejectedValue(
      new teamsModule.TeamsWebhookError('Teams offline', 400)
    )

    // Não deve lançar — Teams é fire-and-forget
    await expect(IntegracoesService.notificarCriacao('res-1', 'op-1')).resolves.not.toThrow()

    expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          servico:   'TEAMS',
          statusHttp: 400,
          erro:      expect.stringContaining('Teams offline'),
        }),
      })
    )
  })
})

// ─── notificarConfirmacao ─────────────────────────────────────────────────────

describe('IntegracoesService.notificarConfirmacao', () => {
  beforeEach(() => jest.clearAllMocks())

  it('não notifica Teams para modalidade REMOTO', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue(makeReserva({ modalidadeReserva: 'REMOTO' }))

    await IntegracoesService.notificarConfirmacao('res-1')

    expect(teamsModule.notificarTeams).not.toHaveBeenCalled()
  })

  it('notifica Teams com laboratório confirmado', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue(makeReserva({ laboratorio: { id: 'lab-1', nome: 'Lab 01' } }))
    ;(prisma.historicoTramitacao.findFirst as jest.Mock).mockResolvedValue({ usuarioId: 'op-1' })
    ;(teamsModule.notificarTeams as jest.Mock).mockResolvedValue(undefined)

    await IntegracoesService.notificarConfirmacao('res-1')

    expect(teamsModule.notificarTeams).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'CONFIRMACAO', laboratorio: 'Lab 01' })
    )
    expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ servico: 'TEAMS', statusHttp: 202 }) })
    )
  })
})

// ─── notificarRejeicao ────────────────────────────────────────────────────────

describe('IntegracoesService.notificarRejeicao', () => {
  beforeEach(() => jest.clearAllMocks())

  it('não notifica para modalidade RAS', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue(makeReserva({ modalidadeReserva: 'RAS' }))

    await IntegracoesService.notificarRejeicao('res-1', 'Lab fechado')

    expect(teamsModule.notificarTeams).not.toHaveBeenCalled()
  })

  it('notifica Teams com motivo de rejeição', async () => {
    const motivo = 'Laboratório em manutenção'
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
    ;(prisma.historicoTramitacao.findFirst as jest.Mock).mockResolvedValue({ usuarioId: 'op-1' })
    ;(teamsModule.notificarTeams as jest.Mock).mockResolvedValue(undefined)

    await IntegracoesService.notificarRejeicao('res-1', motivo)

    expect(teamsModule.notificarTeams).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'REJEICAO', motivoRejeicao: motivo })
    )
  })
})