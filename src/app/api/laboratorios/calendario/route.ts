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
  const fim    = endOfWeek(ref,   { weekStartsOn: 1 })

  // Busca pelo campo dia (Date) que substituiu dataInicio/dataFim
  const datasReserva = await prisma.dataHorarioReserva.findMany({
    where: {
      dia: { gte: inicio, lte: fim },
      reserva: {
        status: { in: ['AGUARDANDO_CONFIRMACAO', 'CONFIRMADA'] },
        ...(laboratorioId ? { laboratorioId } : {}),
      },
    },
    include: {
      reserva: {
        select: {
          id:    true,
          titulo: true,
          status: true,
          turma:       { select: { codigo: true, nome: true, curso: true } },
          laboratorio: { select: { id: true, nome: true, codigo: true } },
          professor:   { select: { nome: true } },
        },
      },
    },
    orderBy: { dia: 'asc' },
  })

  const laboratorios = laboratorioId
    ? []
    : await prisma.laboratorio.findMany({
        where:   { ativo: true },
        select:  { id: true, nome: true, codigo: true },
        orderBy: { nome: 'asc' },
      })

  return NextResponse.json({
    inicio: inicio.toISOString(),
    fim:    fim.toISOString(),
    laboratorios,
    eventos: datasReserva.map((d) => ({
      id:          d.id,
      reservaId:   d.reservaId,
      // Mantém dia + horaInicio + horaFim no lugar de dataInicio/dataFim
      dia:         d.dia,
      horaInicio:  d.horaInicio,
      horaFim:     d.horaFim,
      titulo:      d.reserva.titulo,
      disciplina:  d.reserva.turma.nome,
      turma:       d.reserva.turma.codigo,
      curso:       d.reserva.turma.curso,
      status:      d.reserva.status,
      laboratorio: d.reserva.laboratorio,
      professor:   d.reserva.professor.nome,
    })),
  })
}
