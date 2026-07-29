/**
 * Testes do IntegracoesService (CSC + Teams)
 *
 * REGRA DE NEGÓCIO (refatoração): CSC e Teams só são notificados na CRIAÇÃO
 * da solicitação de reserva. Os testes de notificarConfirmacao() e
 * notificarRejeicao() foram REMOVIDOS porque esses métodos não existem mais
 * — confirmação, rejeição e marcação de conflito não disparam nenhuma ação
 * externa (nem CSC, nem Teams).
 *
 * Nova regra (dual ticket):
 * - Ticket A (CSC IEC, flex 2307): abre para TODAS as modalidades (PRESENCIAL, REMOTO, RAS)
 * - Ticket B (Praça da Liberdade, flex 1381): abre APENAS para PRESENCIAL
 * - Teams card: enviado APENAS quando Ticket B (Praça da Liberdade) SUCCEDE, e carrega APENAS o protocolo da Praça da Liberdade
 * - codigoPessoa: fallback para '919880' (ou CSC_CODIGO_PESSOA_FALLBACK) — nunca lança exceção
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
  }
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

// ─── Setup env vars para testes ───────────────────────────────────────────────

beforeAll(() => {
  process.env.CSC_FLEX_FIELD_103 = '2307'
  process.env.CSC_FLEX_FIELD_103_PRACA_LIBERDADE = '1381'
  process.env.CSC_CODIGO_PESSOA_FALLBACK = '919880'
  process.env.CSC_API_URL = 'https://csc.pucminas.br/API/api/chamado/AbrirChamado'
  process.env.CSC_TOKEN = 'test-token'
  process.env.CSC_CATALOGO_ID = '4293'
  // Novas variáveis de ambiente específicas
  process.env.APP_ENV = 'homologacao'
  process.env.CSC_API_URL_HOMOLOGACAO = 'https://csc-homolog.pucminas.br/API/api/chamado/AbrirChamado'
  process.env.CSC_DETALHES_URL_HOMOLOGACAO = 'https://csc-homolog.pucminas.br/API/api/chamado/RetornaDetalhesChamados'
  process.env.CSC_TOKEN_HOMOLOGACAO = 'test-token-homolog'
  process.env.CSC_CATALOGO_ID_HOMOLOGACAO = '4293'
  process.env.CSC_FLEX_FIELD_103_HOMOLOGACAO = '2307'
  process.env.CSC_FLEX_FIELD_103_PRACA_LIBERDADE_HOMOLOGACAO = '1381'
})

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

  it('REMOTO: chama apenas Ticket A (CSC IEC), NÃO chama Ticket B, NÃO envia Teams', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue(makeReserva({ modalidadeReserva: 'REMOTO' }))
    ;(prisma.usuario.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue({ id: 'op-1', codigoPessoa: '288319' })
    ;(cscModule.abrirChamadoCSC as jest.Mock)
      .mockResolvedValue({ protocolo: 'CSC-IEC-001', raw: {} })

    await IntegracoesService.notificarCriacao('res-1', 'op-1')

    // Ticket A chamado com flex 2307
    expect(cscModule.abrirChamadoCSC).toHaveBeenCalledTimes(1)
    expect(cscModule.abrirChamadoCSC).toHaveBeenCalledWith(
      expect.objectContaining({ flexField103: '2307' })
    )

    // Protocolo CSC IEC salvo
    expect(prisma.solicitacaoReserva.update).toHaveBeenCalledWith({
      where: { id: 'res-1' },
      data:  { cscProtocolo: 'CSC-IEC-001' },
    })

    // Ticket B NÃO chamado (sem segunda chamada)
    expect(cscModule.abrirChamadoCSC).toHaveBeenCalledTimes(1)

    // NÃO envia Teams
    expect(teamsModule.notificarTeams).not.toHaveBeenCalled()

    // LogIntegracao para CSC_IEC
    expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ servico: 'CSC_IEC', statusHttp: 200 }),
      })
    )

    // Histórico para Ticket A
    expect(prisma.historicoTramitacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evento: 'ENVIO_CSC',
          metadados: expect.objectContaining({ fila: 'IEC', protocolo: 'CSC-IEC-001' }),
        }),
      })
    )
  })

  it('RAS: chama apenas Ticket A (CSC IEC), NÃO chama Ticket B, NÃO envia Teams', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue(makeReserva({ modalidadeReserva: 'RAS' }))
    ;(prisma.usuario.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue({ id: 'op-1', codigoPessoa: '288319' })
    ;(cscModule.abrirChamadoCSC as jest.Mock)
      .mockResolvedValue({ protocolo: 'CSC-IEC-002', raw: {} })

    await IntegracoesService.notificarCriacao('res-1', 'op-1')

    // Ticket A chamado com flex 2307
    expect(cscModule.abrirChamadoCSC).toHaveBeenCalledTimes(1)
    expect(cscModule.abrirChamadoCSC).toHaveBeenCalledWith(
      expect.objectContaining({ flexField103: '2307' })
    )

    // NÃO envia Teams
    expect(teamsModule.notificarTeams).not.toHaveBeenCalled()
  })

  it('operador sem codigoPessoa: usa fallback 919880, NÃO lança exceção, registra flag no log', async () => {
    ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
    ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: null })
    ;(cscModule.abrirChamadoCSC as jest.Mock).mockResolvedValue({ protocolo: 'CSC-IEC-003', raw: {} })

    await IntegracoesService.notificarCriacao('res-1', 'op-1')

    // Ticket A chamado com loginSolicitante = fallback
    expect(cscModule.abrirChamadoCSC).toHaveBeenCalledWith(
      expect.objectContaining({ loginSolicitante: '919880', flexField103: '2307' })
    )

    // Flag de fallback no payload do log
    expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          servico: 'CSC_IEC',
          payload: expect.objectContaining({ codigoPessoaFallbackUsado: true }),
        }),
      })
    )
  })

  it('PRESENCIAL: ambos tickets sucedem → dois chamados CSC, Teams com protocolo da Praça da Liberdade APENAS', async () => {
      // Em produção (APP_ENV=producao), ambos tickets devem ser abertos
      process.env.APP_ENV = 'producao'
    
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
      ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: '1404149' })
      ;(cscModule.abrirChamadoCSC as jest.Mock)
        .mockResolvedValueOnce({ protocolo: 'CSC-IEC-004', raw: {} })   // Ticket A
        .mockResolvedValueOnce({ protocolo: 'CSC-PL-001', raw: {} })    // Ticket B
      ;(teamsModule.notificarTeams as jest.Mock).mockResolvedValue(undefined)

      await IntegracoesService.notificarCriacao('res-1', 'op-1')

      // Ticket A (CSC IEC) - flex 2307
      expect(cscModule.abrirChamadoCSC).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ flexField103: '2307' })
      )
      // Ticket B (Praça da Liberdade) - flex 1381
      expect(cscModule.abrirChamadoCSC).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ flexField103: '1381' })
      )
      expect(cscModule.abrirChamadoCSC).toHaveBeenCalledTimes(2)

      // Ambos protocolos salvos na reserva
      expect(prisma.solicitacaoReserva.update).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ data: { cscProtocolo: 'CSC-IEC-004' } })
      )
      expect(prisma.solicitacaoReserva.update).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ data: { cscProtocoloPracaLiberdade: 'CSC-PL-001' } })
      )

      // Dois históricos ENVIO_CSC com fila diferente
      expect(prisma.historicoTramitacao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            evento: 'ENVIO_CSC',
            metadados: expect.objectContaining({ fila: 'IEC', protocolo: 'CSC-IEC-004' }),
          }),
        })
      )
      expect(prisma.historicoTramitacao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            evento: 'ENVIO_CSC',
            metadados: expect.objectContaining({ fila: 'PRACA_LIBERDADE', protocolo: 'CSC-PL-001' }),
          }),
        })
      )

      // Dois logs de integração com servico diferente
      expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ servico: 'CSC_IEC', statusHttp: 200 }) })
      )
      expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ servico: 'CSC_PRACA_LIBERDADE', statusHttp: 200 }) })
      )

      // Teams chamado APENAS com protocolo da Praça da Liberdade
      expect(teamsModule.notificarTeams).toHaveBeenCalledTimes(1)
      const teamsPayload = (teamsModule.notificarTeams as jest.Mock).mock.calls[0][0]
      expect(teamsPayload.cscProtocolo).toBe('CSC-PL-001')
      // Garante que NÃO é o protocolo CSC IEC
      expect(teamsPayload.cscProtocolo).not.toBe('CSC-IEC-004')
    })

  it('Ticket A (CSC IEC) falha em PRESENCIAL: loga erro, NÃO lança, Ticket B ainda tentado, Teams enviado se Ticket B suceder', async () => {
      // Em produção (APP_ENV=producao), Ticket B deve ser tentado mesmo se Ticket A falhar
      process.env.APP_ENV = 'producao'
    
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
      ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: '1404149' })
      ;(cscModule.abrirChamadoCSC as jest.Mock)
        .mockRejectedValueOnce(new cscModule.CscApiError('CSC IEC indisponível', 503)) // Ticket A falha
        .mockResolvedValueOnce({ protocolo: 'CSC-PL-002', raw: {} })                    // Ticket B sucesso
      ;(teamsModule.notificarTeams as jest.Mock).mockResolvedValue(undefined)

    // Não deve lançar exceção
    await expect(IntegracoesService.notificarCriacao('res-1', 'op-1')).resolves.not.toThrow()

    // Ticket A chamado e falhou
    expect(cscModule.abrirChamadoCSC).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ flexField103: '2307' })
    )
    // Ticket B AINDA chamado
    expect(cscModule.abrirChamadoCSC).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ flexField103: '1381' })
    )
    expect(cscModule.abrirChamadoCSC).toHaveBeenCalledTimes(2)

    // Log de erro para CSC_IEC
    expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          servico: 'CSC_IEC',
          statusHttp: 503,
          erro: expect.stringContaining('CSC IEC indisponível'),
        }),
      })
    )

    // cscProtocolo NÃO atualizado (Ticket A falhou)
    // cscProtocoloPracaLiberdade ATUALIZADO (Ticket B sucesso)
    expect(prisma.solicitacaoReserva.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cscProtocoloPracaLiberdade: 'CSC-PL-002' } })
    )
    // Não deve ter atualizado cscProtocolo (IEC)
            const updateCalls = (prisma.solicitacaoReserva.update as jest.Mock).mock.calls as Array<[ { data?: { cscProtocolo?: string } } ]>
            const cscIecUpdate = updateCalls.find((call) => call[0]?.data?.cscProtocolo)
            expect(cscIecUpdate).toBeUndefined()

        // Teams AINDA enviado (com protocolo Praça da Liberdade)
        expect(teamsModule.notificarTeams).toHaveBeenCalledTimes(1)
        const teamsPayload = (teamsModule.notificarTeams as jest.Mock).mock.calls[0][0]
        expect(teamsPayload.cscProtocolo).toBe('CSC-PL-002')
      })

      it('APP_ENV=homologacao PRESENCIAL: apenas Ticket A (CSC IEC) chamado, Ticket B NÃO chamado, sem Teams', async () => {
        // Em homologação (APP_ENV=homologacao), apenas Ticket A deve ser aberto
        process.env.APP_ENV = 'homologacao'
    
        ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
        ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: '1404149' })
        ;(cscModule.abrirChamadoCSC as jest.Mock).mockResolvedValue({ protocolo: 'CSC-IEC-007', raw: {} })
        ;(teamsModule.notificarTeams as jest.Mock).mockResolvedValue(undefined)

        await IntegracoesService.notificarCriacao('res-1', 'op-1')

        // Ticket A chamado com flex 2307
        expect(cscModule.abrirChamadoCSC).toHaveBeenCalledTimes(1)
        expect(cscModule.abrirChamadoCSC).toHaveBeenCalledWith(
          expect.objectContaining({ flexField103: '2307' })
        )

        // Ticket B NÃO chamado (sem segunda chamada)
        expect(cscModule.abrirChamadoCSC).toHaveBeenCalledTimes(1)

        // Protocolo CSC IEC salvo
        expect(prisma.solicitacaoReserva.update).toHaveBeenCalledWith({
          where: { id: 'res-1' },
          data:  { cscProtocolo: 'CSC-IEC-007' },
        })

        // cscProtocoloPracaLiberdade NÃO atualizado
        const updateCalls = (prisma.solicitacaoReserva.update as jest.Mock).mock.calls as Array<[ { data?: { cscProtocoloPracaLiberdade?: string } } ]>
        const plUpdate = updateCalls.find((call) => call[0]?.data?.cscProtocoloPracaLiberdade)
        expect(plUpdate).toBeUndefined()

        // NÃO envia Teams
        expect(teamsModule.notificarTeams).not.toHaveBeenCalled()

        // LogIntegracao para CSC_IEC
        expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ servico: 'CSC_IEC', statusHttp: 200 }),
          })
        )

        // LogIntegracao para CSC_PRACA_LIBERDADE NÃO deve existir
        const logIntegracaoCalls = (prisma.logIntegracao.create as jest.Mock).mock.calls
        const plLog = logIntegracaoCalls.find((call: any) => call[0]?.data?.servico === 'CSC_PRACA_LIBERDADE')
        expect(plLog).toBeUndefined()

        // Histórico para Ticket A
        expect(prisma.historicoTramitacao.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              evento: 'ENVIO_CSC',
              metadados: expect.objectContaining({ fila: 'IEC', protocolo: 'CSC-IEC-007' }),
            }),
          })
        )
      })

      it('APP_ENV undefined (fail-closed) PRESENCIAL: apenas Ticket A (CSC IEC) chamado, Ticket B NÃO chamado, sem Teams', async () => {
              // Com APP_ENV undefined (fail-closed), apenas Ticket A deve ser aberto
              delete process.env.APP_ENV
   
              ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
              ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: '1404149' })
              ;(cscModule.abrirChamadoCSC as jest.Mock).mockResolvedValue({ protocolo: 'CSC-IEC-008', raw: {} })
              ;(teamsModule.notificarTeams as jest.Mock).mockResolvedValue(undefined)

              await IntegracoesService.notificarCriacao('res-1', 'op-1')

              // Ticket A chamado com flex 2307
              expect(cscModule.abrirChamadoCSC).toHaveBeenCalledTimes(1)
              expect(cscModule.abrirChamadoCSC).toHaveBeenCalledWith(
                expect.objectContaining({ flexField103: '2307' })
              )

              // Ticket B NÃO chamado
              expect(cscModule.abrirChamadoCSC).toHaveBeenCalledTimes(1)

              // Protocolo CSC IEC salvo
              expect(prisma.solicitacaoReserva.update).toHaveBeenCalledWith({
                where: { id: 'res-1' },
                data:  { cscProtocolo: 'CSC-IEC-008' },
              })

              // cscProtocoloPracaLiberdade NÃO atualizado
              const updateCalls = (prisma.solicitacaoReserva.update as jest.Mock).mock.calls as Array<[ { data?: { cscProtocoloPracaLiberdade?: string } } ]>
              const plUpdate = updateCalls.find((call) => call[0]?.data?.cscProtocoloPracaLiberdade)
              expect(plUpdate).toBeUndefined()

              // NÃO envia Teams
              expect(teamsModule.notificarTeams).not.toHaveBeenCalled()

              // LogIntegracao para CSC_IEC
              expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
                expect.objectContaining({
                  data: expect.objectContaining({ servico: 'CSC_IEC', statusHttp: 200 }),
                })
              )

              // LogIntegracao para CSC_PRACA_LIBERDADE NÃO deve existir
                            const logIntegracaoCalls = (prisma.logIntegracao.create as jest.Mock).mock.calls as Array<[ { data?: { servico?: string } } ]>
                            const plLog = logIntegracaoCalls.find((call) => call[0]?.data?.servico === 'CSC_PRACA_LIBERDADE')
                            expect(plLog).toBeUndefined()
                          })

        it('Ticket B (Praça da Liberdade) falha em PRESENCIAL: loga erro, NÃO envia Teams, Ticket A já sucedido permanece', async () => {
      // Em produção (APP_ENV=producao), Ticket B deve ser tentado e pode falhar
      process.env.APP_ENV = 'producao'
    
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
      ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: '1404149' })
      ;(cscModule.abrirChamadoCSC as jest.Mock)
        .mockResolvedValueOnce({ protocolo: 'CSC-IEC-005', raw: {} })   // Ticket A sucesso
        .mockRejectedValueOnce(new cscModule.CscApiError('Praça Liberdade indisponível', 503)) // Ticket B falha
      ;(teamsModule.notificarTeams as jest.Mock).mockResolvedValue(undefined)

    // Não deve lançar exceção
    await expect(IntegracoesService.notificarCriacao('res-1', 'op-1')).resolves.not.toThrow()

    // Ticket A sucesso
    expect(cscModule.abrirChamadoCSC).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ flexField103: '2307' })
    )
    // Ticket B falhou
    expect(cscModule.abrirChamadoCSC).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ flexField103: '1381' })
    )

    // cscProtocolo ATUALIZADO (Ticket A)
    expect(prisma.solicitacaoReserva.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { cscProtocolo: 'CSC-IEC-005' } })
    )
    // cscProtocoloPracaLiberdade NÃO atualizado (Ticket B falhou)
        const updateCalls = (prisma.solicitacaoReserva.update as jest.Mock).mock.calls as Array<[ { data?: { cscProtocoloPracaLiberdade?: string } } ]>
        const plUpdate = updateCalls.find((call) => call[0]?.data?.cscProtocoloPracaLiberdade)
        expect(plUpdate).toBeUndefined()

    // Log de erro para CSC_PRACA_LIBERDADE
    expect(prisma.logIntegracao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          servico: 'CSC_PRACA_LIBERDADE',
          statusHttp: 503,
          erro: expect.stringContaining('Praça Liberdade indisponível'),
        }),
      })
    )

    // Teams NÃO enviado (regra: card só com protocolo da Praça da Liberdade)
    expect(teamsModule.notificarTeams).not.toHaveBeenCalled()
  })

  it('Teams erro: cria log mas NÃO propaga a exceção (fire-and-forget)', async () => {
      // Em produção (APP_ENV=producao), Teams deve ser chamado
      process.env.APP_ENV = 'producao'
    
      ;(prisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(makeReserva())
      ;(prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'op-1', codigoPessoa: '1404149' })
      ;(cscModule.abrirChamadoCSC as jest.Mock)
        .mockResolvedValueOnce({ protocolo: 'CSC-IEC-006', raw: {} })
        .mockResolvedValueOnce({ protocolo: 'CSC-PL-003', raw: {} })
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

// ─── Garantia de regressão: API pública do serviço ────────────────────────────

describe('IntegracoesService — superfície pública', () => {
  it('NÃO expõe mais notificarConfirmacao nem notificarRejeicao', () => {
    // Esses métodos foram removidos por decisão de negócio: confirmação,
    // rejeição e conflito não devem disparar Teams/CSC. Este teste existe
    // para que, se alguém os reintroduzir por engano, a suíte falhe e force
    // uma decisão consciente em vez de uma regressão silenciosa.
    expect((IntegracoesService as unknown as Record<string, unknown>).notificarConfirmacao).toBeUndefined()
    expect((IntegracoesService as unknown as Record<string, unknown>).notificarRejeicao).toBeUndefined()
  })
})