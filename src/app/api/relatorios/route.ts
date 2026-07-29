import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { temPermissao } from '@/lib/auth/rbac'
import { subDays, startOfDay, endOfDay, format } from 'date-fns'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temPermissao(session.user.perfil, 'relatorios', 'visualizar')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const de   = searchParams.get('de')
  const ate  = searchParams.get('ate')
  const tipo = searchParams.get('tipo')

  const dataInicio = de  ? startOfDay(new Date(de  + 'T00:00:00')) : startOfDay(subDays(new Date(), 30))
  const dataFim    = ate ? endOfDay(new Date(ate + 'T23:59:59'))   : endOfDay(new Date())

  if (tipo === 'csv') return exportarCSVReservas(dataInicio, dataFim)

  const periodoWhere = { criadoEm: { gte: dataInicio, lte: dataFim } }

  const [totalReservas, porStatus, porModalidade, porLaboratorio, porProfessor,
         historicoPorDia, tempoMedio, totalOperacoes, operacoesPorAcao, operacoesPorUsuario] =
    await Promise.all([
      prisma.solicitacaoReserva.count({ where: periodoWhere }),
      prisma.solicitacaoReserva.groupBy({ by: ['status'], where: periodoWhere, _count: { _all: true }, orderBy: { _count: { status: 'desc' } } }),
      prisma.solicitacaoReserva.groupBy({ by: ['modalidadeReserva'], where: periodoWhere, _count: { _all: true } }),
      prisma.solicitacaoReserva.groupBy({ by: ['laboratorioId'], where: { ...periodoWhere, laboratorioId: { not: null } }, _count: { _all: true }, orderBy: { _count: { laboratorioId: 'desc' } }, take: 10 }),
      prisma.solicitacaoReserva.groupBy({ by: ['professorId'], where: periodoWhere, _count: { _all: true }, orderBy: { _count: { professorId: 'desc' } }, take: 10 }),
      prisma.$queryRaw`SELECT TO_CHAR("criadoEm" AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia, COUNT(*) AS total FROM solicitacoes_reserva WHERE "criadoEm" >= ${dataInicio} AND "criadoEm" <= ${dataFim} GROUP BY dia ORDER BY dia ASC`,
      prisma.$queryRaw`SELECT AVG(EXTRACT(EPOCH FROM (conf."criadoEm" - res."criadoEm")) / 3600) AS media_horas FROM solicitacoes_reserva res JOIN historico_tramitacao conf ON conf."reservaId" = res.id AND conf.evento = 'CONFIRMACAO' WHERE res."criadoEm" >= ${dataInicio} AND res."criadoEm" <= ${dataFim}`,
      prisma.logOperacao.count({ where: periodoWhere }),
      prisma.logOperacao.groupBy({ by: ['acao'], where: periodoWhere, _count: { _all: true }, orderBy: { _count: { acao: 'desc' } } }),
      prisma.logOperacao.groupBy({ by: ['usuarioId'], where: periodoWhere, _count: { _all: true }, orderBy: { _count: { usuarioId: 'desc' } }, take: 10 }),
    ])

  const labIds = (porLaboratorio.map((l: any) => l.laboratorioId).filter(Boolean)) as string[]
  const labsNomes = await prisma.laboratorio.findMany({ where: { id: { in: labIds } }, select: { id: true, nome: true, codigo: true } })
  const labMap = Object.fromEntries(labsNomes.map((l: any) => [l.id, l]))

  const profIds = porProfessor.map((p: any) => p.professorId)
  const profsNomes = await prisma.professor.findMany({ where: { id: { in: profIds } }, select: { id: true, nome: true } })
  const profMap = Object.fromEntries(profsNomes.map((p: any) => [p.id, p]))

  const usuIds = (operacoesPorUsuario as any[]).map((u) => u.usuarioId)
  const usuNomes = await prisma.usuario.findMany({ where: { id: { in: usuIds } }, select: { id: true, nome: true, perfil: true } })
  const usuMap = Object.fromEntries(usuNomes.map((u: any) => [u.id, u]))

  return NextResponse.json({
    periodo: { de: dataInicio.toISOString(), ate: dataFim.toISOString() },
    reservas: {
      total: totalReservas,
      porStatus: (porStatus as any[]).map((s) => ({ status: s.status, total: s._count._all })),
      porModalidade: (porModalidade as any[]).map((m) => ({ modalidade: m.modalidadeReserva, total: m._count._all })),
      porLaboratorio: (porLaboratorio as any[]).map((l) => ({ laboratorioId: l.laboratorioId, laboratorio: labMap[l.laboratorioId] ?? null, total: l._count._all })),
      porProfessor: (porProfessor as any[]).map((p) => ({ professorId: p.professorId, professor: profMap[p.professorId] ?? null, total: p._count._all })),
      evolucaoDiaria: (historicoPorDia as any[]).map((d) => ({ dia: d.dia, total: Number(d.total) })),
      tempoMedioConfirmacaoHoras: (tempoMedio as any[])[0]?.media_horas ?? null,
    },
    auditoria: {
      totalOperacoes,
      porAcao: (operacoesPorAcao as any[]).map((a) => ({ acao: a.acao, total: a._count._all })),
      porUsuario: (operacoesPorUsuario as any[]).map((u) => ({ usuarioId: u.usuarioId, usuario: usuMap[u.usuarioId] ?? null, total: u._count._all })),
    },
  })
}

async function exportarCSVReservas(de: Date, ate: Date): Promise<NextResponse> {
  const reservas = await prisma.solicitacaoReserva.findMany({
    where: { criadoEm: { gte: de, lte: ate } },
    select: {
      titulo: true, status: true, modalidadeReserva: true, softwaresUtilizados: true,
      numeroAlunos: true, cscProtocolo: true, criadoEm: true,
      nomeSolicitanteExterno: true,
      solicitante: { select: { nome: true, email: true } },
      professor:   { select: { nome: true, email: true } },
      turma:       { select: { nome: true, codigo: true, curso: true, semestre: true } },
      laboratorio: { select: { nome: true, codigo: true } },
      datas:       { select: { dia: true, horaInicio: true, horaFim: true }, orderBy: { dia: 'asc' } },
    },
    orderBy: { criadoEm: 'desc' },
  })

  const header = ['Título','Status','Modalidade','Solicitante','Professor','Turma','Curso','Semestre','Laboratório','Nº Alunos','Softwares','Protocolo CSC','Criado em','Data 1','Horário 1','Data 2','Horário 2','Data 3','Horário 3'].join(';')

  const rows = reservas.map((r) => {
    const datasFlat = r.datas.flatMap((d) => [format(new Date(d.dia), 'dd/MM/yyyy'), `${d.horaInicio}–${d.horaFim}`])
    while (datasFlat.length < 6) datasFlat.push('')
    return [r.titulo, r.status, r.modalidadeReserva, r.nomeSolicitanteExterno ?? r.solicitante?.nome ?? 'Desconhecido', r.professor.nome, r.turma.codigo, r.turma.curso, r.turma.semestre, r.laboratorio?.nome ?? '', r.numeroAlunos, r.softwaresUtilizados, r.cscProtocolo ?? '', format(new Date(r.criadoEm), 'dd/MM/yyyy HH:mm'), ...datasFlat.slice(0, 6)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')
  })

  const csv = ['\uFEFF' + header, ...rows].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reservas-${format(de, 'yyyyMMdd')}-${format(ate, 'yyyyMMdd')}.csv"`,
    },
  })
}