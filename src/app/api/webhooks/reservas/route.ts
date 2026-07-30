import { NextResponse } from 'next/server'
import { criarReservaWebhookSchema } from '@/lib/validations/reserva'
import { ReservaService } from '@/services/reserva.service'
import { AnexoService } from '@/services/anexo.service'
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
        
        const extractVal = (obj: any) => obj?.value !== undefined ? obj.value : obj
        
        let dataSemestre: string | undefined = undefined

        // Verifica se a IA usou o formato encapsulado (extracted_data)
        if (parsedAi.extracted_data) {
          const edLocal = parsedAi.extracted_data
          dataSemestre = edLocal.turmaManual ? extractVal(edLocal.turmaManual.semestre) : undefined
        } else {
          dataSemestre = parsedAi.turmaManual ? parsedAi.turmaManual.semestre : undefined
        }

        // Lógica de inferência para semestre caso não venha ou venha vazio
        if (!dataSemestre || dataSemestre.trim() === '') {
          const hoje = new Date()
          dataSemestre = `${hoje.getFullYear()}/${hoje.getMonth() >= 6 ? '2' : '1'}`
        }

        if (parsedAi.extracted_data) {
          const edLocal = parsedAi.extracted_data
          
          dataToParse = {
            nomeSolicitanteExterno: body.nomeSolicitanteExterno,
            emailSolicitanteExterno: body.emailSolicitanteExterno,
            titulo: extractVal(edLocal.titulo),
            modalidadeReserva: extractVal(edLocal.modalidadeReserva),
            numeroAlunos: Number(extractVal(edLocal.numeroAlunos)),
            softwaresUtilizados: extractVal(edLocal.softwaresUtilizados),
            datas: extractVal(edLocal.datas),
            professorManual: edLocal.professorManual ? {
              nome: extractVal(edLocal.professorManual.nome),
              email: extractVal(edLocal.professorManual.email),
              matricula: String(extractVal(edLocal.professorManual.matricula) || ''),
              telefone: extractVal(edLocal.professorManual.telefone) || undefined,
            } : undefined,
            turmaManual: edLocal.turmaManual ? {
              codigo: String(extractVal(edLocal.turmaManual.codigo) || ''),
              nome: extractVal(edLocal.turmaManual.nome),
              curso: extractVal(edLocal.turmaManual.curso),
              codigoDisciplina: String(extractVal(edLocal.turmaManual.codigoDisciplina) || ''),
              semestre: dataSemestre,
              numOferta: String(extractVal(edLocal.turmaManual.numOferta) || ''),
            } : undefined
          }
        } else {
          // Formato plano
          dataToParse = {
            nomeSolicitanteExterno: body.nomeSolicitanteExterno,
            emailSolicitanteExterno: body.emailSolicitanteExterno,
            anexos: body.anexos,
            ...parsedAi
          }
          if (dataToParse.turmaManual && (!dataToParse.turmaManual.semestre || dataToParse.turmaManual.semestre.trim() === '')) {
            dataToParse.turmaManual.semestre = dataSemestre
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

    // Processar anexos, se houver
    if (input.anexos && input.anexos.length > 0) {
      for (const anexo of input.anexos) {
        try {
          const buffer = Buffer.from(anexo.conteudoBase64, 'base64')
          await AnexoService.upload(reserva.id, buffer, anexo.nome, anexo.mimeType, buffer.length)
        } catch (e) {
          console.error('[Webhook] Falha ao fazer upload do anexo', anexo.nome, e)
        }
      }
    }

    // 4. Criação concluída (integrações foram movidas para disparo manual)
    return NextResponse.json({ sucesso: true, reserva }, { status: 201 })
  } catch (error) {
    console.error('[Webhook] Falha na criação:', error)
    return NextResponse.json({ error: 'Falha interna' }, { status: 500 })
  }
}
