import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IntegracoesService } from '@/services/integracao.service'
import { prisma } from '@/lib/prisma/client'
import * as cscModule from '@/lib/integrations/csc'
import * as teamsModule from '@/lib/integrations/teams'

// Mocks
vi.mock('@/lib/prisma/client', () => ({
  prisma: {
    solicitacaoReserva: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    usuario: {
      findUniqueOrThrow: vi.fn(),
    },
    historicoTramitacao: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    logIntegracao: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/integrations/csc', () => ({
  abrirChamadoCSC: vi.fn(),
  CscApiError: class CscApiError extends Error {
    constructor(message: string, statusHttp?: number, responseBody?: unknown) {
      super(message)
      ;(this as any).statusHttp = statusHttp
      ;(this as any).responseBody = responseBody
    }
  },
}))

vi.mock('@/lib/integrations/teams', () => ({
  notificarTeams: vi.fn(),
  TeamsWebhookError: class TeamsWebhookError extends Error {
    constructor(message: string, statusHttp?: number, responseBody?: unknown) {
      super(message)
      ;(this as any).statusHttp = statusHttp
      ;(this as any).responseBody = responseBody
    }
  },
}))

describe('IntegracoesService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('notificarCriacao', () => {
    it('skip REMOTO/RAS reserva sem chamar CSC nem Teams', async () => {
      const mockReserva = {
        id: 'res-1',
        modalidadeReserva: 'REMOTO',
        titulo: 'Test',
        softwaresUtilizados: 'Zoom',
        numeroAlunos: 30,
        solicitante: { id: 'u1', nome: 'User', email: 'u@iec.br' },
        professor: { id: 'p1', nome: 'Prof', email: 'p@iec.br', telefone: null, departamento: null },
        turma: { id: 't1', codigo: 'T1', nome: 'Disciplina', curso: 'Course', codigoDisciplina: 'D1', semestre: '2025/1' },
        datas: [],
      }

      vi.spyOn(prisma.solicitacaoReserva, 'findUniqueOrThrow').mockResolvedValue(mockReserva)

      await IntegracoesService.notificarCriacao('res-1', 'op-1')

      expect(cscModule.abrirChamadoCSC).not.toHaveBeenCalled()
      expect(teamsModule.notificarTeams).not.toHaveBeenCalled()
    })

    it('lança erro se operador sem codigoPessoa', async () => {
      const mockReserva = {
        id: 'res-1',
        modalidadeReserva: 'PRESENCIAL',
        titulo: 'Test',
        softwaresUtilizados: 'Zoom',
        numeroAlunos: 30,
        solicitante: { id: 'u1', nome: 'User', email: 'u@iec.br' },
        professor: { id: 'p1', nome: 'Prof', email: 'p@iec.br', telefone: null, departamento: null },
        turma: { id: 't1', codigo: 'T1', nome: 'Disciplina', curso: 'Course', codigoDisciplina: 'D1', semestre: '2025/1' },
        datas: [],
      }

      vi.spyOn(prisma.solicitacaoReserva, 'findUniqueOrThrow').mockResolvedValue(mockReserva)
      vi.spyOn(prisma.usuario, 'findUniqueOrThrow').mockResolvedValue({
        id: 'op-1',
        codigoPessoa: null,
      } as any)

      await expect(IntegracoesService.notificarCriacao('res-1', 'op-1')).rejects.toThrow()
    })

    it('CSC sucesso: salva protocolo e cria logs', async () => {
      const mockReserva = {
        id: 'res-1',
        modalidadeReserva: 'PRESENCIAL',
        titulo: 'Test',
        softwaresUtilizados: 'Visual Studio',
        numeroAlunos: 25,
        solicitante: { id: 'u1', nome: 'User', email: 'u@iec.br' },
        professor: { id: 'p1', nome: 'Prof', email: 'p@iec.br', telefone: '1199999', departamento: 'TI' },
        turma: { id: 't1', codigo: 'TI-2025-1', nome: 'C++', curso: 'Eng.Software', codigoDisciplina: 'C1', semestre: '2025/1' },
        datas: [
          { dataInicio: new Date('2025-06-15'), dataFim: new Date('2025-06-15T10:00:00') },
        ],
      }

      vi.spyOn(prisma.solicitacaoReserva, 'findUniqueOrThrow').mockResolvedValue(mockReserva)
      vi.spyOn(prisma.usuario, 'findUniqueOrThrow').mockResolvedValue({
        id: 'op-1',
        codigoPessoa: '288319',
      } as any)
      vi.spyOn(cscModule, 'abrirChamadoCSC').mockResolvedValue({
        protocolo: 'CSC-12345',
        raw: { success: true },
      })
      vi.spyOn(teamsModule, 'notificarTeams').mockResolvedValue(undefined)

      await IntegracoesService.notificarCriacao('res-1', 'op-1')

      expect(prisma.solicitacaoReserva.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: { cscProtocolo: 'CSC-12345' },
      })

      expect(prisma.historicoTramitacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reservaId: 'res-1',
          evento: 'ENVIO_CSC',
          metadados: { protocolo: 'CSC-12345' },
        }),
      })

      expect(prisma.logIntegracao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          servico: 'CSC',
          statusHttp: 200,
        }),
      })

      expect(teamsModule.notificarTeams).toHaveBeenCalled()
    })

    it('CSC erro: cria log com erro e propaga exceção', async () => {
      const mockReserva = {
        id: 'res-1',
        modalidadeReserva: 'PRESENCIAL',
        titulo: 'Test',
        softwaresUtilizados: 'Visual Studio',
        numeroAlunos: 25,
        solicitante: { id: 'u1', nome: 'User', email: 'u@iec.br' },
        professor: { id: 'p1', nome: 'Prof', email: 'p@iec.br', telefone: null, departamento: null },
        turma: { id: 't1', codigo: 'TI-2025-1', nome: 'C++', curso: 'Eng.Software', codigoDisciplina: 'C1', semestre: '2025/1' },
        datas: [],
      }

      vi.spyOn(prisma.solicitacaoReserva, 'findUniqueOrThrow').mockResolvedValue(mockReserva)
      vi.spyOn(prisma.usuario, 'findUniqueOrThrow').mockResolvedValue({
        id: 'op-1',
        codigoPessoa: '288319',
      } as any)

      const cscError = new cscModule.CscApiError('CSC indisponível', 503)
      vi.spyOn(cscModule, 'abrirChamadoCSC').mockRejectedValue(cscError)

      await expect(IntegracoesService.notificarCriacao('res-1', 'op-1')).rejects.toThrow()

      expect(prisma.logIntegracao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          servico: 'CSC',
          statusHttp: 503,
          erro: expect.stringContaining('CSC indisponível'),
        }),
      })
    })

    it('Teams erro: cria log mas NÃO propaga exceção', async () => {
      const mockReserva = {
        id: 'res-1',
        modalidadeReserva: 'PRESENCIAL',
        titulo: 'Test',
        softwaresUtilizados: 'Visual Studio',
        numeroAlunos: 25,
        solicitante: { id: 'u1', nome: 'User', email: 'u@iec.br' },
        professor: { id: 'p1', nome: 'Prof', email: 'p@iec.br', telefone: null, departamento: null },
        turma: { id: 't1', codigo: 'TI-2025-1', nome: 'C++', curso: 'Eng.Software', codigoDisciplina: 'C1', semestre: '2025/1' },
        datas: [],
      }

      vi.spyOn(prisma.solicitacaoReserva, 'findUniqueOrThrow').mockResolvedValue(mockReserva)
      vi.spyOn(prisma.usuario, 'findUniqueOrThrow').mockResolvedValue({
        id: 'op-1',
        codigoPessoa: '288319',
      } as any)
      vi.spyOn(cscModule, 'abrirChamadoCSC').mockResolvedValue({
        protocolo: 'CSC-12345',
        raw: {},
      })

      const teamsError = new teamsModule.TeamsWebhookError('Teams webhook failed', 400)
      vi.spyOn(teamsModule, 'notificarTeams').mockRejectedValue(teamsError)

      // Deve NÃO lançar erro
      await expect(IntegracoesService.notificarCriacao('res-1', 'op-1')).resolves.not.toThrow()

      expect(prisma.logIntegracao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          servico: 'TEAMS',
          statusHttp: 400,
          erro: expect.stringContaining('Teams webhook failed'),
        }),
      })
    })
  })

  describe('notificarConfirmacao', () => {
    it('skip REMOTO/RAS reserva sem chamar Teams', async () => {
      const mockReserva = {
        id: 'res-1',
        modalidadeReserva: 'REMOTO',
        titulo: 'Test',
        softwaresUtilizados: 'Zoom',
        numeroAlunos: 30,
        solicitante: { id: 'u1', nome: 'User', email: 'u@iec.br' },
        professor: { id: 'p1', nome: 'Prof', email: 'p@iec.br' },
        turma: { id: 't1', codigo: 'T1', nome: 'Disciplina' },
        laboratorio: null,
        datas: [],
      }

      vi.spyOn(prisma.solicitacaoReserva, 'findUniqueOrThrow').mockResolvedValue(mockReserva)

      await IntegracoesService.notificarConfirmacao('res-1')

      expect(teamsModule.notificarTeams).not.toHaveBeenCalled()
    })

    it('Teams sucesso: notifica e cria logs', async () => {
      const mockReserva = {
        id: 'res-1',
        modalidadeReserva: 'PRESENCIAL',
        titulo: 'Laboratorio de teste',
        softwaresUtilizados: 'VSCode',
        numeroAlunos: 30,
        solicitante: { id: 'u1', nome: 'User', email: 'u@iec.br' },
        professor: { id: 'p1', nome: 'Prof', email: 'p@iec.br' },
        turma: { id: 't1', codigo: 'T1', nome: 'Disciplina' },
        laboratorio: { id: 'l1', nome: 'LAB-INFO-01' },
        datas: [],
      }

      vi.spyOn(prisma.solicitacaoReserva, 'findUniqueOrThrow').mockResolvedValue(mockReserva)
      vi.spyOn(teamsModule, 'notificarTeams').mockResolvedValue(undefined)
      vi.spyOn(prisma.historicoTramitacao, 'findFirst').mockResolvedValue({
        usuarioId: 'op-1',
      } as any)

      await IntegracoesService.notificarConfirmacao('res-1')

      expect(teamsModule.notificarTeams).toHaveBeenCalled()
      expect(prisma.logIntegracao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          servico: 'TEAMS',
          statusHttp: 202,
        }),
      })
    })
  })

  describe('notificarRejeicao', () => {
    it('skip REMOTO/RAS reserva', async () => {
      const mockReserva = {
        id: 'res-1',
        modalidadeReserva: 'RAS',
        titulo: 'Test',
        softwaresUtilizados: 'Zoom',
        numeroAlunos: 30,
        solicitante: { id: 'u1', nome: 'User', email: 'u@iec.br' },
        professor: { id: 'p1', nome: 'Prof', email: 'p@iec.br' },
        turma: { id: 't1', codigo: 'T1', nome: 'Disciplina' },
        datas: [],
      }

      vi.spyOn(prisma.solicitacaoReserva, 'findUniqueOrThrow').mockResolvedValue(mockReserva)

      await IntegracoesService.notificarRejeicao('res-1', 'Laboratório indisponível')

      expect(teamsModule.notificarTeams).not.toHaveBeenCalled()
    })

    it('Teams sucesso: notifica com motivo e cria logs', async () => {
      const mockReserva = {
        id: 'res-1',
        modalidadeReserva: 'PRESENCIAL',
        titulo: 'Test',
        softwaresUtilizados: 'VSCode',
        numeroAlunos: 30,
        solicitante: { id: 'u1', nome: 'User', email: 'u@iec.br' },
        professor: { id: 'p1', nome: 'Prof', email: 'p@iec.br' },
        turma: { id: 't1', codigo: 'T1', nome: 'Disciplina' },
        datas: [],
      }

      const motivo = 'Laboratório fechado para manutenção'

      vi.spyOn(prisma.solicitacaoReserva, 'findUniqueOrThrow').mockResolvedValue(mockReserva)
      vi.spyOn(teamsModule, 'notificarTeams').mockResolvedValue(undefined)
      vi.spyOn(prisma.historicoTramitacao, 'findFirst').mockResolvedValue({
        usuarioId: 'op-1',
      } as any)

      await IntegracoesService.notificarRejeicao('res-1', motivo)

      expect(teamsModule.notificarTeams).toHaveBeenCalledWith(
        expect.objectContaining({
          evento: 'REJEICAO',
          motivoRejeicao: motivo,
        })
      )
    })
  })
})
