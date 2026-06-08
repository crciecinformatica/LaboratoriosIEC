import {
  StatusReserva,
  TipoEvento,
  Perfil,
  SolicitacaoReserva,
  DataHorarioReserva,
  HistoricoTramitacao,
  Laboratorio,
  Professor,
  Turma,
  Usuario,
} from '@prisma/client'

export type { StatusReserva, TipoEvento, Perfil }

// Reserva com todas as relações carregadas
export type ReservaCompleta = SolicitacaoReserva & {
  solicitante: Pick<Usuario, 'id' | 'nome' | 'email'>
  professor: Professor
  turma: Turma
  laboratorio: Laboratorio | null
  datas: DataHorarioReserva[]
  historico: (HistoricoTramitacao & {
    usuario: Pick<Usuario, 'id' | 'nome'>
  })[]
}

// Máquina de estados: transições válidas
export const transicoesValidas: Record<StatusReserva, StatusReserva[]> = {
  CRIADA:                 ['AGUARDANDO_CONFIRMACAO'],
  AGUARDANDO_CONFIRMACAO: ['CONFIRMADA', 'CONFLITO_DE_DATAS', 'REJEITADA'],
  CONFLITO_DE_DATAS:      ['AGUARDANDO_CONFIRMACAO', 'REJEITADA'],
  CONFIRMADA:             [],
  REJEITADA:              [],
}

export function transicaoValida(
  atual: StatusReserva,
  proxima: StatusReserva
): boolean {
  return transicoesValidas[atual].includes(proxima)
}

// Labels legíveis para exibição na UI
export const statusLabel: Record<StatusReserva, string> = {
  CRIADA:                 'Criada',
  AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação',
  CONFIRMADA:             'Confirmada',
  CONFLITO_DE_DATAS:      'Conflito de datas',
  REJEITADA:              'Rejeitada',
}

export const statusColor: Record<StatusReserva, string> = {
  CRIADA:                 'gray',
  AGUARDANDO_CONFIRMACAO: 'amber',
  CONFIRMADA:             'green',
  CONFLITO_DE_DATAS:      'red',
  REJEITADA:              'coral',
}

export const eventoLabel: Record<TipoEvento, string> = {
  CRIACAO:                  'Solicitação criada',
  ENVIO_CSC:                'Enviado ao CSC',
  NOTIFICACAO_TEAMS:        'Notificação Teams',
  CONFIRMACAO:              'Reserva confirmada',
  REJEICAO:                 'Reserva rejeitada',
  CONFLITO_DETECTADO:       'Conflito de datas detectado',
  REAGENDAMENTO:            'Reagendamento',
  GOOGLE_CALENDAR_CRIADO:   'Evento Google Calendar criado',
  GOOGLE_CALENDAR_ATUALIZADO: 'Evento Google Calendar atualizado',
}
