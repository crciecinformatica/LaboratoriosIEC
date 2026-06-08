import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { prisma } from '@/lib/prisma/client'
import { startOfWeek, endOfWeek, parseISO } from 'date-fns'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const laboratorioId = searchParams.get('laboratorioId')
  const ref = searchParams.get('semana') ? parseISO(searchParams.get('semana')!) : new Date()

  const inicio = startOfWeek(ref, { weekStartsOn: 1 })
  const fim = endOfWeek(ref, { weekStartsOn: 1 })

  const eventos = await prisma.dataHorarioReserva.findMany({
    where: {
      dataInicio: { gte: inicio, lte: fim },
      reserva: {
        status: { in: ['AGUARDANDO_CONFIRMACAO', 'CONFIRMADA'] },
        ...(laboratorioId ? { laboratorioId } : {}),
      },
    },
    include: {
      reserva: {
        select: {
          id: true,
          titulo: true,
          status: true,
          turma: { select: { codigo: true, nome: true, curso: true } },
          laboratorio: { select: { id: true, nome: true, codigo: true } },
          professor: { select: { nome: true } },
        },
      },
    },
    orderBy: { dataInicio: 'asc' },
  })

  const laboratorios = laboratorioId
    ? []
    : await prisma.laboratorio.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, codigo: true },
        orderBy: { nome: 'asc' },
      })

  return NextResponse.json({
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    laboratorios,
    eventos: eventos.map((e) => ({
      id: e.id,
      reservaId: e.reservaId,
      dataInicio: e.dataInicio,
      dataFim: e.dataFim,
      titulo: e.reserva.titulo,
      disciplina: e.reserva.turma.nome,
      status: e.reserva.status,
      laboratorio: e.reserva.laboratorio,
      professor: e.reserva.professor.nome,
      turma: e.reserva.turma.codigo,
      curso: e.reserva.turma.curso,
    })),
  })
}
