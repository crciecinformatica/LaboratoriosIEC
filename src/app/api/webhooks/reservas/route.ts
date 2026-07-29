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
    let dataToParse = body

    // 2.1. Se o Power Automate enviar o texto bruto da IA, fazemos o "achatamento" no backend
    if (body.ai_payload) {
      try {
        const parsedAi = typeof body.ai_payload === 'string' ? JSON.parse(body.ai_payload) : body.ai_payload
        
        // Verifica se a IA usou o formato encapsulado (extracted_data)
        if (parsedAi.extracted_data) {
          const ed = parsedAi.extracted_data
          const extractVal = (obj: any) => obj?.value !== undefined ? obj.value : obj
          
          dataToParse = {
            nomeSolicitanteExterno: body.nomeSolicitanteExterno,
            emailSolicitanteExterno: body.emailSolicitanteExterno,
            titulo: extractVal(ed.titulo),
            modalidadeReserva: extractVal(ed.modalidadeReserva),
            numeroAlunos: Number(extractVal(ed.numeroAlunos)),
            softwaresUtilizados: extractVal(ed.softwaresUtilizados),
            datas: extractVal(ed.datas),
            professorManual: ed.professorManual ? {
              nome: extractVal(ed.professorManual.nome),
              email: extractVal(ed.professorManual.email),
              matricula: String(extractVal(ed.professorManual.matricula) || ''),
            } : undefined,
            turmaManual: ed.turmaManual ? {
              codigo: String(extractVal(ed.turmaManual.codigo) || ''),
              nome: extractVal(ed.turmaManual.nome),
              curso: extractVal(ed.turmaManual.curso),
              codigoDisciplina: String(extractVal(ed.turmaManual.codigoDisciplina) || ''),
              semestre: extractVal(ed.turmaManual.semestre),
            } : undefined
          }
        } else {
          // Formato plano
          dataToParse = {
            nomeSolicitanteExterno: body.nomeSolicitanteExterno,
            emailSolicitanteExterno: body.emailSolicitanteExterno,
            ...parsedAi
          }
        }
      } catch (err) {
        console.error('[Webhook] Falha ao fazer parse do ai_payload', err)
        return NextResponse.json({ error: 'Falha ao processar ai_payload' }, { status: 400 })
      }
    }

    const parseResult = criarReservaWebhookSchema.safeParse(dataToParse)
    
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
