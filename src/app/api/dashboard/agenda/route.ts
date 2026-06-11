import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { startOfWeek, endOfWeek, parseISO } from 'date-fns'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ref   = searchParams.get('semana') ? parseISO(searchParams.get('semana')!) : new Date()
  const inicio = startOfWeek(ref, { weekStartsOn: 1 })
  const fim    = endOfWeek(ref,   { weekStartsOn: 1 })

  const where =
    session.user.perfil === 'APOIO_ACADEMICO'
      ? { solicitanteId: session.user.id }
      : {}

  // dia agora é campo Date direto em SolicitacaoReserva
  const reservas = await prisma.solicitacaoReserva.findMany({
    where: {
      ...where,
      status: { in: ['AGUARDANDO_CONFIRMACAO', 'CONFIRMADA'] },
      dia:    { gte: inicio, lte: fim },
    },
    include: {
      turma:       { select: { nome: true, codigo: true, curso: true } },
      laboratorio: { select: { id: true, nome: true, codigo: true } },
      professor:   { select: { nome: true } },
    },
    orderBy: [{ dia: 'asc' }, { horaInicio: 'asc' }],
  })

  return NextResponse.json({
    inicio: inicio.toISOString(),
    fim:    fim.toISOString(),
    eventos: reservas.map((r) => ({
      id:          r.id,
      reservaId:   r.id,
      // Monta datetime completo a partir de dia + horaInicio/horaFim para exibição
      dia:         r.dia,
      horaInicio:  r.horaInicio,
      horaFim:     r.horaFim,
      titulo:      r.titulo,
      disciplina:  r.turma.nome,
      turma:       r.turma.codigo,
      curso:       r.turma.curso,
      status:      r.status,
      laboratorio: r.laboratorio,
      professor:   r.professor.nome,
    })),
  })
}