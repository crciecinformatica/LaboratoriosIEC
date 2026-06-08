import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { startOfWeek, endOfWeek, parseISO } from 'date-fns'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ref = searchParams.get('semana') ? parseISO(searchParams.get('semana')!) : new Date()

  const inicio = startOfWeek(ref, { weekStartsOn: 1 })
  const fim = endOfWeek(ref, { weekStartsOn: 1 })

  const where =
    session.user.perfil === 'APOIO_ACADEMICO'
      ? { solicitanteId: session.user.id }
      : {}

  const eventos = await prisma.dataHorarioReserva.findMany({
    where: {
      dataInicio: { gte: inicio, lte: fim },
      reserva: {
        ...where,
        status: { in: ['AGUARDANDO_CONFIRMACAO', 'CONFIRMADA'] },
      },
    },
    include: {
      reserva: {
        select: {
          id: true,
          titulo: true,
          status: true,
          turma: { select: { nome: true, codigo: true, curso: true } },
          laboratorio: { select: { id: true, nome: true, codigo: true } },
          professor: { select: { nome: true } },
        },
      },
    },
    orderBy: { dataInicio: 'asc' },
  })

  return NextResponse.json({
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    eventos: eventos.map((e) => ({
      id: e.id,
      reservaId: e.reservaId,
      dataInicio: e.dataInicio,
      dataFim: e.dataFim,
      titulo: e.reserva.titulo,
      disciplina: e.reserva.turma.nome,
      turma: e.reserva.turma.codigo,
      curso: e.reserva.turma.curso,
      status: e.reserva.status,
      laboratorio: e.reserva.laboratorio,
      professor: e.reserva.professor.nome,
    })),
  })
}
