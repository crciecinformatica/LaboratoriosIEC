import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { ConflitosService } from '@/services/conflito.service'
import { z } from 'zod'

const sugestaoSchema = z.object({
  laboratorioId:   z.string().cuid('Laboratório inválido'),
  dia:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD'),
  duracaoMin:      z.number().int().min(30).max(480).default(120),
  excluirReservaId: z.string().cuid().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)

  const parse = sugestaoSchema.safeParse({
    laboratorioId:    searchParams.get('laboratorioId'),
    dia:              searchParams.get('dia'),
    duracaoMin:       searchParams.get('duracaoMin') ? Number(searchParams.get('duracaoMin')) : 120,
    excluirReservaId: searchParams.get('excluirReservaId') ?? undefined,
  })

  if (!parse.success) {
    return NextResponse.json({ error: 'Parâmetros inválidos', detalhes: parse.error.flatten() }, { status: 422 })
  }

  const { laboratorioId, dia, duracaoMin, excluirReservaId } = parse.data

  // Converte "YYYY-MM-DD" → Date meia-noite UTC (padrão do sistema)
  const diaDate = new Date(`${dia}T00:00:00.000Z`)

  try {
    const sugestoes = await ConflitosService.sugerirHorarios(
      laboratorioId,
      diaDate,
      duracaoMin,
      excluirReservaId
    )

    return NextResponse.json({ dia, duracaoMin, sugestoes })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao buscar sugestões'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}