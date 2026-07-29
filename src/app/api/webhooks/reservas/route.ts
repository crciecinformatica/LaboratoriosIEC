import { NextResponse } from 'next/server'
import { criarReservaWebhookSchema } from '@/lib/validations/reserva'
import { ReservaService } from '@/services/reserva.service'
import { IntegracoesService } from '@/services/integracao.service'

export async function POST(req: Request) {
  try {
    // 1. Validar autenticação via API Key
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
    
    if (!token || token !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // 2. Fazer o parse do payload
    const body = await req.json()
    const parseResult = criarReservaWebhookSchema.safeParse(body)
    
    if (!parseResult.success) {
      return NextResponse.json({ 
        error: 'Dados inválidos', 
        detalhes: parseResult.error.flatten() 
      }, { status: 400 })
    }

    const input = parseResult.data

    // 3. Criar a reserva sem solicitanteId (opcional no service)
    const reserva = await ReservaService.criar(input)

    // 4. Criação concluída (integrações foram movidas para disparo manual)
    return NextResponse.json({ sucesso: true, reserva }, { status: 201 })
  } catch (error) {
    console.error('[Webhook] Falha na criação:', error)
    return NextResponse.json({ error: 'Falha interna' }, { status: 500 })
  }
}
