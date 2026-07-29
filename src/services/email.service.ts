import { prisma } from '@/lib/prisma/client'
import { TipoEvento, Prisma } from '@prisma/client'
import { sendOutlookEmail, OutlookEmailError, type FluxoEmail } from '@/lib/integrations/outlook'

interface ReservaEmailInfo {
  id: string
  titulo: string
  modalidadeReserva: string
  softwaresUtilizados: string
  numeroAlunos: number
  nomeSolicitanteExterno: string | null
  emailSolicitanteExterno: string | null
  solicitante: { nome: string; email: string } | null
  professor: { nome: string; email: string }
  turma: { codigo: string; nome: string; curso: string; semestre: string; numOferta: string | null }
  laboratorio: { nome: string | null; codigo: string | null; localizacao: string | null } | null
  datas: { dia: Date; horaInicio: string; horaFim: string }[]
}

function sanitizeForJson(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return Prisma.JsonNull as unknown as Prisma.InputJsonValue
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(sanitizeForJson) as Prisma.InputJsonValue[]
  try { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
  catch { return String(value) }
}

function formatarData(dia: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dia)
}

function montarLinhasDatas(datas: ReservaEmailInfo['datas']): string {
  return datas
    .map((d) => `• ${formatarData(d.dia)} — ${d.horaInicio} às ${d.horaFim}`)
    .join('\n')
}

function montarDatasEstruturadas(datas: ReservaEmailInfo['datas']): { dia: string; horaInicio: string; horaFim: string }[] {
  if (!datas || !Array.isArray(datas)) {
    console.warn('[Email] montarDatasEstruturadas received invalid datas:', datas)
    return []
  }
  return datas.map((d) => ({
    dia: d.dia ? formatarData(d.dia) : '',
    horaInicio: d.horaInicio ?? '',
    horaFim: d.horaFim ?? '',
  }))
}

function montarEnderecoLaboratorio(laboratorio: ReservaEmailInfo['laboratorio']): string {
  if (!laboratorio?.localizacao) return 'Endereço não informado.'
  return laboratorio.localizacao
}

function montarResumoReserva(reserva: ReservaEmailInfo): string {
  const laboratorioNome = reserva.laboratorio?.nome ?? 'Não especificado'
  const oferta = reserva.turma.numOferta ?? '—'

  return [
    `Título: ${reserva.titulo}`,
    `Modalidade: ${reserva.modalidadeReserva}`,
    `Laboratório: ${laboratorioNome}`,
    `Professor: ${reserva.professor.nome}`,
    `E-mail do professor: ${reserva.professor.email}`,
    `Turma: ${reserva.turma.codigo} — ${reserva.turma.nome}`,
    `Curso: ${reserva.turma.curso}`,
    `Semestre: ${reserva.turma.semestre}`,
    `Oferta: ${oferta}`,
    `Nº alunos: ${reserva.numeroAlunos}`,
    `Softwares: ${reserva.softwaresUtilizados}`,
    '',
    `Solicitante: ${reserva.nomeSolicitanteExterno ?? reserva.solicitante?.nome ?? 'Desconhecido'} (${reserva.emailSolicitanteExterno ?? reserva.solicitante?.email ?? 'Sem email'})`,
  ].join('\n')
}

function getDefaultRecipients(): string[] {
  const raw = process.env.OUTLOOK_TO_EMAILS
  if (!raw) return []
  return raw.split(',').map((address) => address.trim()).filter(Boolean)
}

function montarAssuntoConfirmacao(reserva: ReservaEmailInfo): string {
  return `Reserva confirmada: ${reserva.titulo}`
}

function montarAssuntoRejeicao(reserva: ReservaEmailInfo): string {
  return `Reserva rejeitada: ${reserva.titulo}`
}

function montarCorpoConfirmacao(reserva: ReservaEmailInfo): string {
  return [
    `Prezado(a),`,
    '',
    `Reservamos o laboratório ${reserva.laboratorio?.nome ?? 'não informado'} para as datas e horários abaixo:`,
    '',
    montarLinhasDatas(reserva.datas),
    '',
    `Endereço: ${montarEnderecoLaboratorio(reserva.laboratorio)}`,
    '',
    montarResumoReserva(reserva),
    '',
    'Atenciosamente,',
    'Equipe de Operação de TI',
  ].join('\n')
}

function montarCorpoRejeicao(reserva: ReservaEmailInfo, motivo?: string): string {
  return [
    `Prezado(a) ,`,
    '',
    'Infelizmente não há laboratórios disponíveis para as datas solicitadas.',
    motivo ? `Motivo: ${motivo}` : '',
    '',
    `Solicitação: ${reserva.titulo}`,
    `Professor: ${reserva.professor.nome}`,
    `Turma: ${reserva.turma.codigo} — ${reserva.turma.nome}`,
    '',
    'Datas solicitadas:',
    montarLinhasDatas(reserva.datas),
    '',
    'Atenciosamente,',
    'Equipe de Operação de TI',
  ]
    .filter(Boolean)
    .join('\n')
}

async function carregarReservaEmailInfo(reservaId: string): Promise<ReservaEmailInfo> {
  const reserva = await prisma.solicitacaoReserva.findUniqueOrThrow({
    where: { id: reservaId },
    select: {
      id: true,
      titulo: true,
      modalidadeReserva: true,
      softwaresUtilizados: true,
      numeroAlunos: true,
      nomeSolicitanteExterno: true,
      emailSolicitanteExterno: true,
      solicitante: { select: { nome: true, email: true } },
      professor: { select: { nome: true, email: true } },
      turma: { select: { codigo: true, nome: true, curso: true, semestre: true, numOferta: true } },
      laboratorio: { select: { nome: true, codigo: true, localizacao: true } },
      datas: { select: { dia: true, horaInicio: true, horaFim: true }, orderBy: { dia: 'asc' } },
    },
  })

  return reserva
}

async function registrarEmailHistorico(reservaId: string, operadorId: string, evento: TipoEvento, observacao: string) {
  await prisma.historicoTramitacao.create({
    data: { reservaId, usuarioId: operadorId, evento, observacao },
  })
}

async function registrarEmailLog(
  fluxo: FluxoEmail,
  payload: Record<string, unknown>,
  resposta: Record<string, unknown>,
  erro?: string
) {
  await prisma.logIntegracao.create({
    data: {
      servico: 'OUTLOOK',
      endpoint: `power-automate:${fluxo.toLowerCase()}`,
      metodo: 'POST',
      payload: sanitizeForJson(payload),
      resposta: sanitizeForJson(resposta),
      statusHttp: erro ? 500 : 250,
      erro,
    },
  })
}

export class EmailService {
  static async sendReservaConfirmacaoEmail(reservaId: string, operadorId: string) {
    const reserva = await carregarReservaEmailInfo(reservaId)
    const recipients = getDefaultRecipients()
    const solicitanteEmail = reserva.emailSolicitanteExterno ?? reserva.solicitante?.email
    if (solicitanteEmail && !recipients.includes(solicitanteEmail)) {
      recipients.push(solicitanteEmail)
    }
    const subject = montarAssuntoConfirmacao(reserva)
    const text = montarCorpoConfirmacao(reserva)

    try {
      console.log('[Email] Raw reserva.datas from Prisma:', JSON.stringify(reserva.datas, (k, v) => v instanceof Date ? v.toISOString() : v))
      const dados = {
        reservaId: reserva.id,
        titulo: reserva.titulo,
        laboratorio: reserva.laboratorio?.nome ?? null,
        endereco: montarEnderecoLaboratorio(reserva.laboratorio),
        professor: reserva.professor.nome,
        professorEmail: reserva.professor.email,
        turma: `${reserva.turma.codigo} — ${reserva.turma.nome}`,
        curso: reserva.turma.curso,
        semestre: reserva.turma.semestre,
        numeroAlunos: reserva.numeroAlunos,
        softwares: reserva.softwaresUtilizados,
        solicitante: reserva.nomeSolicitanteExterno ?? reserva.solicitante?.nome ?? 'Desconhecido',
        solicitanteEmail: reserva.emailSolicitanteExterno ?? reserva.solicitante?.email ?? 'desconhecido@pucminas.br',
        datas: montarDatasEstruturadas(reserva.datas),
      }
      console.log('[Email] Payload dados:', JSON.stringify(dados))
      await sendOutlookEmail({
        flow: 'CONFIRMACAO',
        to: recipients,
        subject,
        text,
        ...dados,  // Spread flat - matches flow schema
      })
      await Promise.all([
        registrarEmailHistorico(reservaId, operadorId, TipoEvento.ENVIO_EMAIL, 'Email de confirmação enviado ao apoio acadêmico.'),
        registrarEmailLog('CONFIRMACAO', { reservaId, tipo: 'CONFIRMACAO' }, { message: 'OK' }),
      ])
    } catch (error) {
      const message = error instanceof OutlookEmailError ? error.message : String(error)
      await registrarEmailLog('CONFIRMACAO', { reservaId, tipo: 'CONFIRMACAO' }, { message: 'FAILED' }, message)
      console.error('[Email] Falha no envio de confirmação:', message)
      throw error
    }
  }

  static async sendReservaRejeicaoEmail(reservaId: string, operadorId: string, motivoRejeicao?: string) {
    const reserva = await carregarReservaEmailInfo(reservaId)
    const recipients = getDefaultRecipients()
    const solicitanteEmail = reserva.emailSolicitanteExterno ?? reserva.solicitante?.email
    if (solicitanteEmail && !recipients.includes(solicitanteEmail)) {
      recipients.push(solicitanteEmail)
    }
    const subject = montarAssuntoRejeicao(reserva)
    const text = montarCorpoRejeicao(reserva, motivoRejeicao)

    try {
      const dados = {
        reservaId: reserva.id,
        titulo: reserva.titulo,
        motivoRejeicao: motivoRejeicao ?? null,
        professor: reserva.professor.nome,
        professorEmail: reserva.professor.email,
        turma: `${reserva.turma.codigo} — ${reserva.turma.nome}`,
        curso: reserva.turma.curso,
        semestre: reserva.turma.semestre,
        numeroAlunos: reserva.numeroAlunos,
        softwares: reserva.softwaresUtilizados,
        solicitante: reserva.nomeSolicitanteExterno ?? reserva.solicitante?.nome ?? 'Desconhecido',
        solicitanteEmail: reserva.emailSolicitanteExterno ?? reserva.solicitante?.email ?? 'desconhecido@pucminas.br',
        datas: montarDatasEstruturadas(reserva.datas),
      }
      console.log('[Email] Payload dados.datas:', JSON.stringify(dados.datas))
      await sendOutlookEmail({
        flow: 'REJEICAO',
        to: recipients,
        subject,
        text,
        ...dados,  // Spread flat - matches flow schema
      })
      await Promise.all([
        registrarEmailHistorico(reservaId, operadorId, TipoEvento.ENVIO_EMAIL, 'Email de rejeição enviado ao apoio acadêmico.'),
        registrarEmailLog('REJEICAO', { reservaId, tipo: 'REJEICAO' }, { message: 'OK' }),
      ])
    } catch (error) {
      const message = error instanceof OutlookEmailError ? error.message : String(error)
      await registrarEmailLog('REJEICAO', { reservaId, tipo: 'REJEICAO' }, { message: 'FAILED' }, message)
      console.error('[Email] Falha no envio de rejeição:', message)
      throw error
    }
  }
}
