import { prisma } from '@/lib/prisma/client'
import { uploadAnexoStorage } from '@/lib/integrations/supabase'

const TIPOS_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const MAX_BYTES = 10 * 1024 * 1024

export class AnexoService {
  static async upload(
    reservaId: string,
    file: Buffer,
    nomeArquivo: string,
    mimeType: string,
    tamanho: number
  ) {
    if (!TIPOS_PERMITIDOS.includes(mimeType)) {
      throw new Error('Tipo de arquivo não permitido. Use PDF, imagem ou DOC.')
    }
    if (tamanho > MAX_BYTES) {
      throw new Error('Arquivo excede o limite de 10 MB.')
    }

    const reserva = await prisma.solicitacaoReserva.findUnique({
      where: { id: reservaId },
      select: { id: true },
    })
    if (!reserva) throw new Error('Reserva não encontrada')

    const url = await uploadAnexoStorage(reservaId, file, nomeArquivo, mimeType)

    return prisma.anexo.create({
      data: { reservaId, nomeArquivo, url, tamanho, mimeType },
    })
  }

  static async listar(reservaId: string) {
    return prisma.anexo.findMany({
      where: { reservaId },
      orderBy: { criadoEm: 'desc' },
    })
  }
}
