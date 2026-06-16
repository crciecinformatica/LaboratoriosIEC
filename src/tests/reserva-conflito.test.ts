/**
 * Testes unitários do GoogleCalendarService
 * Execução: npx jest tests/google-calendar.service.test.ts
 */

// Mock do módulo googleapis ANTES de qualquer import do serviço
const mockInsert  = jest.fn()
const mockUpdate  = jest.fn()
const mockDelete  = jest.fn()
const mockFreebusy = jest.fn()

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
        getAccessToken: jest.fn().mockResolvedValue({ token: 'fake-token' }),
      })),
    },
    calendar: jest.fn().mockReturnValue({
      events: {
        insert:  mockInsert,
        update:  mockUpdate,
        delete:  mockDelete,
      },
      freebusy: { query: mockFreebusy },
    }),
  },
}))

// Mock das env vars
process.env.GOOGLE_CLIENT_ID     = 'test-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
process.env.GOOGLE_REDIRECT_URI  = 'http://localhost:3000/api/google-calendar/oauth'
process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token'
process.env.GOOGLE_CALENDAR_ID   = 'primary'

// Mock do Prisma
jest.mock('@/lib/prisma/client', () => ({
  prisma: {
    solicitacaoReserva: {
      findUniqueOrThrow: jest.fn(),
      update:            jest.fn(),
    },
    historicoTramitacao: { create: jest.fn() },
    logIntegracao:       { create: jest.fn() },
    $transaction:        jest.fn(async (ops) => {
      if (Array.isArray(ops)) return Promise.all(ops)
      return ops()
    }),
  },
}))

import { criarEvento, atualizarEvento, deletarEvento, buscarHorariosOcupados } from '@/lib/google/calendar'
import { GoogleCalendarService } from '@/services/google-calendar.service'
import { prisma } from '@/lib/prisma/client'

const mockPrisma = prisma as jest.Mocked<typeof prisma>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReserva(overrides = {}) {
  return {
    id:                  'reserva-1',
    titulo:              'Aula de Redes',
    softwaresUtilizados: 'Wireshark',
    numeroAlunos:        30,
    googleEventId:       null,
    professor:   { nome: 'Prof. Silva', email: 'silva@iec.edu.br' },
    turma:       { nome: 'Redes I', codigo: 'SI-2025-1', semestre: '2025/1', curso: 'Sistemas de Informação' },
    laboratorio: { nome: 'Lab 01' },
    solicitante: { nome: 'Maria', email: 'maria@iec.edu.br' },
    datas: [
      { dia: new Date('2025-08-15T00:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' },
    ],
    ...overrides,
  }
}

// ─── criarEvento (lib) ────────────────────────────────────────────────────────

describe('lib/google/calendar — criarEvento', () => {
  beforeEach(() => jest.clearAllMocks())

  it('retorna eventId quando googleapis responde com sucesso', async () => {
    mockInsert.mockResolvedValueOnce({ data: { id: 'gc-event-abc', htmlLink: 'https://cal.google.com/e/abc' } })

    const result = await criarEvento({
      summary:     'Teste',
      description: 'Desc',
      datas: [{ dia: new Date('2025-08-15T00:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' }],
    })

    expect(result.eventId).toBe('gc-event-abc')
    expect(result.htmlLink).toBe('https://cal.google.com/e/abc')
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it('lança erro quando googleapis não retorna id', async () => {
    mockInsert.mockResolvedValueOnce({ data: {} })

    await expect(
      criarEvento({
        summary: 'Teste', description: 'Desc',
        datas: [{ dia: new Date(), horaInicio: '08:00', horaFim: '10:00' }],
      })
    ).rejects.toThrow('Google Calendar não retornou eventId')
  })

  it('lança erro quando nenhuma data é fornecida', async () => {
    await expect(
      criarEvento({ summary: 'Teste', description: 'Desc', datas: [] })
    ).rejects.toThrow('Nenhuma data fornecida')
  })
})

// ─── atualizarEvento (lib) ────────────────────────────────────────────────────

describe('lib/google/calendar — atualizarEvento', () => {
  beforeEach(() => jest.clearAllMocks())

  it('atualiza evento existente', async () => {
    mockUpdate.mockResolvedValueOnce({ data: { id: 'gc-event-xyz' } })

    const result = await atualizarEvento('gc-event-xyz', {
      summary: 'Teste atualizado', description: 'Desc',
      datas: [{ dia: new Date(), horaInicio: '10:00', horaFim: '12:00' }],
    })

    expect(result.eventId).toBe('gc-event-xyz')
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('faz fallback para criarEvento quando evento não existe (404)', async () => {
    mockUpdate.mockRejectedValueOnce({ code: 404 })
    mockInsert.mockResolvedValueOnce({ data: { id: 'gc-novo-event' } })

    const result = await atualizarEvento('gc-event-inexistente', {
      summary: 'Teste', description: 'Desc',
      datas: [{ dia: new Date(), horaInicio: '08:00', horaFim: '10:00' }],
    })

    expect(result.eventId).toBe('gc-novo-event')
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it('propaga outros erros além do 404', async () => {
    mockUpdate.mockRejectedValueOnce({ code: 403, message: 'Forbidden' })

    await expect(
      atualizarEvento('gc-event-xyz', {
        summary: 'Teste', description: 'Desc',
        datas: [{ dia: new Date(), horaInicio: '08:00', horaFim: '10:00' }],
      })
    ).rejects.toMatchObject({ code: 403 })
  })
})

// ─── deletarEvento (lib) ──────────────────────────────────────────────────────

describe('lib/google/calendar — deletarEvento', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deleta evento com sucesso', async () => {
    mockDelete.mockResolvedValueOnce({})
    await expect(deletarEvento('gc-event-del')).resolves.toBeUndefined()
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })

  it('ignora 404 silenciosamente (evento já removido)', async () => {
    mockDelete.mockRejectedValueOnce({ code: 404 })
    await expect(deletarEvento('gc-event-ausente')).resolves.toBeUndefined()
  })

  it('propaga outros erros', async () => {
    mockDelete.mockRejectedValueOnce({ code: 500, message: 'Internal' })
    await expect(deletarEvento('gc-event-falha')).rejects.toMatchObject({ code: 500 })
  })
})

// ─── buscarHorariosOcupados (lib) ─────────────────────────────────────────────

describe('lib/google/calendar — buscarHorariosOcupados', () => {
  beforeEach(() => jest.clearAllMocks())

  it('extrai horários no formato HH:MM do freebusy', async () => {
    mockFreebusy.mockResolvedValueOnce({
      data: {
        calendars: {
          primary: {
            busy: [
              { start: '2025-08-15T08:00:00-03:00', end: '2025-08-15T10:00:00-03:00' },
              { start: '2025-08-15T14:00:00-03:00', end: '2025-08-15T16:00:00-03:00' },
            ],
          },
        },
      },
    })

    const result = await buscarHorariosOcupados(new Date('2025-08-15'))

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ start: '08:00', end: '10:00' })
    expect(result[1]).toMatchObject({ start: '14:00', end: '16:00' })
  })

  it('retorna array vazio quando não há eventos', async () => {
    mockFreebusy.mockResolvedValueOnce({
      data: { calendars: { primary: { busy: [] } } },
    })
    const result = await buscarHorariosOcupados(new Date('2025-08-15'))
    expect(result).toHaveLength(0)
  })
})

// ─── GoogleCalendarService ────────────────────────────────────────────────────

describe('GoogleCalendarService.criarEventoReserva', () => {
  beforeEach(() => jest.clearAllMocks())

  it('cria evento e persiste googleEventId na reserva', async () => {
    const reserva = makeReserva()

    ;(mockPrisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock).mockResolvedValue(reserva)
    mockInsert.mockResolvedValueOnce({ data: { id: 'gc-created-123', htmlLink: 'https://...' } })

    await GoogleCalendarService.criarEventoReserva('reserva-1', 'operador-1')

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockPrisma.solicitacaoReserva.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'reserva-1' },
        data:  expect.objectContaining({ googleEventId: 'gc-created-123' }),
      })
    )
    expect(mockPrisma.historicoTramitacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ evento: 'GOOGLE_CALENDAR_CRIADO' }),
      })
    )
  })
})

describe('GoogleCalendarService.deletarEventoReserva', () => {
  beforeEach(() => jest.clearAllMocks())

  it('não chama delete quando reserva não tem googleEventId', async () => {
    ;(mockPrisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue({ googleEventId: null })

    await GoogleCalendarService.deletarEventoReserva('reserva-sem-evento', 'op-1')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('chama delete e limpa googleEventId quando reserva tem evento', async () => {
    ;(mockPrisma.solicitacaoReserva.findUniqueOrThrow as jest.Mock)
      .mockResolvedValue({ googleEventId: 'gc-to-delete' })
    mockDelete.mockResolvedValueOnce({})

    await GoogleCalendarService.deletarEventoReserva('reserva-1', 'op-1')

    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockPrisma.solicitacaoReserva.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { googleEventId: null } })
    )
  })
})