/**
 * Testes unitários do GoogleCalendarService e lib/google/calendar
 *
 * Roda com: npx jest src/tests/google-calendar.service.test.ts
 */

// ─── Mocks do googleapis (DEVE vir antes de qualquer import) ──────────────────

const mockInsert   = jest.fn()
const mockUpdate   = jest.fn()
const mockDelete   = jest.fn()
const mockFreebusy = jest.fn()

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
        getAccessToken: jest.fn().mockResolvedValue({ token: 'fake-access-token' }),
      })),
    },
    calendar: jest.fn().mockReturnValue({
      events:   { insert: mockInsert, update: mockUpdate, delete: mockDelete },
      freebusy: { query: mockFreebusy },
    }),
  },
}))

// Env vars necessárias para o auth.ts não lançar erro
process.env.GOOGLE_CLIENT_ID     = 'test-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
process.env.GOOGLE_REDIRECT_URI  = 'http://localhost:3000/api/google-calendar/oauth'
process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token'
process.env.GOOGLE_CALENDAR_ID   = 'primary'

// ─── Mock do Prisma ───────────────────────────────────────────────────────────

const mockPrismaReservaFindOrThrow = jest.fn()
const mockPrismaReservaUpdate      = jest.fn()
const mockPrismaHistoricoCreate    = jest.fn()
const mockPrismaLogCreate          = jest.fn()
const mockPrismaTransaction        = jest.fn()

jest.mock('@/lib/prisma/client', () => ({
  prisma: {
    solicitacaoReserva: {
      findUniqueOrThrow: mockPrismaReservaFindOrThrow,
      update:            mockPrismaReservaUpdate,
    },
    historicoTramitacao: { create: mockPrismaHistoricoCreate },
    logIntegracao:       { create: mockPrismaLogCreate },
    $transaction: mockPrismaTransaction,
  },
}))

// ─── Imports (após os mocks) ──────────────────────────────────────────────────

import { criarEvento, atualizarEvento, deletarEvento, buscarHorariosOcupados } from '@/lib/google/calendar'
import { GoogleCalendarService } from '@/services/google-calendar.service'

// $transaction resolve qualquer array ou função passada
mockPrismaTransaction.mockImplementation(async (opsOrFn: unknown) => {
  if (Array.isArray(opsOrFn)) return Promise.all(opsOrFn.map(() => Promise.resolve({})))
  if (typeof opsOrFn === 'function') return (opsOrFn as () => unknown)()
})

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeReservaCompleta(overrides: Record<string, unknown> = {}) {
  return {
    id:                  'reserva-1',
    titulo:              'Aula de Redes',
    softwaresUtilizados: 'Wireshark, Packet Tracer',
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

// ─── lib/google/calendar — criarEvento ───────────────────────────────────────

describe('lib/google/calendar — criarEvento()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('retorna eventId e htmlLink quando googleapis responde com sucesso', async () => {
    mockInsert.mockResolvedValueOnce({
      data: { id: 'gc-abc123', htmlLink: 'https://calendar.google.com/e/abc123' },
    })

    const result = await criarEvento({
      summary:     'Aula de Redes',
      description: 'Turma SI-2025-1',
      datas: [{ dia: new Date('2025-08-15T00:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' }],
    })

    expect(result.eventId).toBe('gc-abc123')
    expect(result.htmlLink).toBe('https://calendar.google.com/e/abc123')
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it('passa os horários corretos no formato dateTime para o Google', async () => {
    mockInsert.mockResolvedValueOnce({ data: { id: 'gc-xyz' } })

    await criarEvento({
      summary: 'Teste', description: 'Desc',
      datas: [{ dia: new Date('2025-09-10T00:00:00.000Z'), horaInicio: '14:00', horaFim: '16:00' }],
    })

    const body = mockInsert.mock.calls[0][0].requestBody
    expect(body.start.dateTime).toContain('14:00')
    expect(body.end.dateTime).toContain('16:00')
    expect(body.start.timeZone).toBe('America/Sao_Paulo')
  })

  it('inclui lista de datas adicionais na description para múltiplas datas', async () => {
    mockInsert.mockResolvedValueOnce({ data: { id: 'gc-multi' } })

    await criarEvento({
      summary: 'Aula Recorrente', description: 'Desc base',
      datas: [
        { dia: new Date('2025-08-15T00:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' },
        { dia: new Date('2025-08-22T00:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' },
        { dia: new Date('2025-08-29T00:00:00.000Z'), horaInicio: '08:00', horaFim: '10:00' },
      ],
    })

    const body = mockInsert.mock.calls[0][0].requestBody
    expect(body.description).toContain('Datas adicionais')
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

// ─── lib/google/calendar — atualizarEvento ────────────────────────────────────

describe('lib/google/calendar — atualizarEvento()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('chama events.update quando evento existe', async () => {
    mockUpdate.mockResolvedValueOnce({ data: { id: 'gc-event-existente' } })

    const result = await atualizarEvento('gc-event-existente', {
      summary: 'Atualizado', description: 'Desc',
      datas: [{ dia: new Date('2025-09-10T00:00:00.000Z'), horaInicio: '10:00', horaFim: '12:00' }],
    })

    expect(result.eventId).toBe('gc-event-existente')
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('faz fallback para criarEvento (insert) quando Google retorna 404', async () => {
    mockUpdate.mockRejectedValueOnce({ code: 404, message: 'Not Found' })
    mockInsert.mockResolvedValueOnce({ data: { id: 'gc-event-novo-fallback' } })

    const result = await atualizarEvento('gc-event-inexistente', {
      summary: 'Fallback', description: 'Desc',
      datas: [{ dia: new Date(), horaInicio: '08:00', horaFim: '10:00' }],
    })

    expect(result.eventId).toBe('gc-event-novo-fallback')
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it('propaga erros que não sejam 404', async () => {
    mockUpdate.mockRejectedValueOnce({ code: 403, message: 'Forbidden' })

    await expect(
      atualizarEvento('gc-event-sem-permissao', {
        summary: 'Erro', description: 'Desc',
        datas: [{ dia: new Date(), horaInicio: '08:00', horaFim: '10:00' }],
      })
    ).rejects.toMatchObject({ code: 403 })
  })
})

// ─── lib/google/calendar — deletarEvento ─────────────────────────────────────

describe('lib/google/calendar — deletarEvento()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('chama events.delete com sucesso', async () => {
    mockDelete.mockResolvedValueOnce({})
    await expect(deletarEvento('gc-event-del')).resolves.toBeUndefined()
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDelete.mock.calls[0][0]).toMatchObject({ eventId: 'gc-event-del' })
  })

  it('ignora 404 silenciosamente (evento já removido manualmente)', async () => {
    mockDelete.mockRejectedValueOnce({ code: 404 })
    await expect(deletarEvento('gc-event-ja-removido')).resolves.toBeUndefined()
  })

  it('propaga outros erros (ex: 500)', async () => {
    mockDelete.mockRejectedValueOnce({ code: 500, message: 'Internal Server Error' })
    await expect(deletarEvento('gc-event-erro')).rejects.toMatchObject({ code: 500 })
  })
})

// ─── lib/google/calendar — buscarHorariosOcupados ────────────────────────────

describe('lib/google/calendar — buscarHorariosOcupados()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('extrai horários HH:MM do retorno freebusy', async () => {
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
    // Verifica que extrai a parte HH:MM do ISO
    expect(result[0].start).toMatch(/^\d{2}:\d{2}$/)
    expect(result[0].end).toMatch(/^\d{2}:\d{2}$/)
  })

  it('retorna array vazio quando não há eventos no dia', async () => {
    mockFreebusy.mockResolvedValueOnce({
      data: { calendars: { primary: { busy: [] } } },
    })

    const result = await buscarHorariosOcupados(new Date('2025-08-15'))
    expect(result).toHaveLength(0)
  })

  it('retorna array vazio quando o calendário não está na resposta', async () => {
    mockFreebusy.mockResolvedValueOnce({ data: { calendars: {} } })

    const result = await buscarHorariosOcupados(new Date('2025-08-15'))
    expect(result).toHaveLength(0)
  })
})

// ─── GoogleCalendarService.criarEventoReserva ─────────────────────────────────

describe('GoogleCalendarService.criarEventoReserva()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('cria evento e persiste googleEventId + cria histórico e log', async () => {
    mockPrismaReservaFindOrThrow.mockResolvedValue(makeReservaCompleta())
    mockInsert.mockResolvedValueOnce({ data: { id: 'gc-criado-123', htmlLink: 'https://...' } })

    await GoogleCalendarService.criarEventoReserva('reserva-1', 'op-1')

    expect(mockInsert).toHaveBeenCalledTimes(1)
    // Verifica que a transação foi chamada com operações que incluem update e creates
    expect(mockPrismaTransaction).toHaveBeenCalledTimes(1)
  })

  it('inclui professor e solicitante nos attendees do evento', async () => {
    mockPrismaReservaFindOrThrow.mockResolvedValue(makeReservaCompleta())
    mockInsert.mockResolvedValueOnce({ data: { id: 'gc-att' } })

    await GoogleCalendarService.criarEventoReserva('reserva-1', 'op-1')

    const callBody = mockInsert.mock.calls[0][0].requestBody
    expect(callBody.attendees).toEqual(
      expect.arrayContaining([
        { email: 'silva@iec.edu.br' },
        { email: 'maria@iec.edu.br' },
      ])
    )
  })

  it('inclui nome do laboratório como location', async () => {
    mockPrismaReservaFindOrThrow.mockResolvedValue(makeReservaCompleta())
    mockInsert.mockResolvedValueOnce({ data: { id: 'gc-loc' } })

    await GoogleCalendarService.criarEventoReserva('reserva-1', 'op-1')

    const callBody = mockInsert.mock.calls[0][0].requestBody
    expect(callBody.location).toBe('Lab 01')
  })

  it('cria log de erro e lança GoogleCalendarError quando insert falha', async () => {
    mockPrismaReservaFindOrThrow.mockResolvedValue(makeReservaCompleta())
    mockInsert.mockRejectedValueOnce(new Error('Quota exceeded'))

    await expect(
      GoogleCalendarService.criarEventoReserva('reserva-1', 'op-1')
    ).rejects.toThrow('Falha ao criar evento no Google Calendar')

    expect(mockPrismaLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          servico: 'GOOGLE_CALENDAR',
          erro:    expect.stringContaining('Quota exceeded'),
        }),
      })
    )
  })
})

// ─── GoogleCalendarService.deletarEventoReserva ───────────────────────────────

describe('GoogleCalendarService.deletarEventoReserva()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('não chama delete quando reserva não tem googleEventId', async () => {
    mockPrismaReservaFindOrThrow.mockResolvedValue({ googleEventId: null })

    await GoogleCalendarService.deletarEventoReserva('reserva-sem-evento', 'op-1')

    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('chama delete e persiste googleEventId=null quando evento existe', async () => {
    mockPrismaReservaFindOrThrow.mockResolvedValue({ googleEventId: 'gc-para-deletar' })
    mockDelete.mockResolvedValueOnce({})

    await GoogleCalendarService.deletarEventoReserva('reserva-1', 'op-1')

    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDelete.mock.calls[0][0].eventId).toBe('gc-para-deletar')
  })
})

// ─── GoogleCalendarService.atualizarEventoReserva ─────────────────────────────

describe('GoogleCalendarService.atualizarEventoReserva()', () => {
  beforeEach(() => jest.clearAllMocks())

  it('chama update quando reserva já tem googleEventId', async () => {
    mockPrismaReservaFindOrThrow.mockResolvedValue(
      makeReservaCompleta({ googleEventId: 'gc-existente' })
    )
    mockUpdate.mockResolvedValueOnce({ data: { id: 'gc-existente' } })

    await GoogleCalendarService.atualizarEventoReserva('reserva-1', 'op-1')

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('chama insert (cria novo) quando reserva não tinha googleEventId', async () => {
    mockPrismaReservaFindOrThrow.mockResolvedValue(
      makeReservaCompleta({ googleEventId: null })
    )
    mockInsert.mockResolvedValueOnce({ data: { id: 'gc-novo' } })

    await GoogleCalendarService.atualizarEventoReserva('reserva-1', 'op-1')

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})