import { prisma } from '@/lib/prisma/client'
import bcrypt from 'bcryptjs'
import { Perfil } from '@prisma/client'

export class SolicitacaoAcessoService {
  /**
   * Cria uma solicitação de acesso pendente (fluxo público, sem sessão).
   * Nunca cria o Usuario diretamente — isso só acontece na aprovação.
   */
  static async solicitar(input: { nome: string; codigoPessoa: string; email: string; senha: string }) {
    const emailExistente = await prisma.usuario.findUnique({ where: { email: input.email } })
    if (emailExistente) {
      throw new Error('Já existe um usuário cadastrado com este email.')
    }

    const solicitacaoPendente = await prisma.solicitacaoAcesso.findFirst({
      where: { email: input.email, status: 'PENDENTE' },
    })
    if (solicitacaoPendente) {
      throw new Error('Já existe uma solicitação de acesso pendente para este email.')
    }

    const senhaHash = await bcrypt.hash(input.senha, 12)

    return prisma.solicitacaoAcesso.create({
      data: {
        nome: input.nome,
        codigoPessoa: input.codigoPessoa,
        email: input.email,
        senhaHash,
      },
      select: { id: true, nome: true, email: true, codigoPessoa: true, status: true, criadoEm: true },
    })
  }

  static async listarPendentes() {
    return prisma.solicitacaoAcesso.findMany({
      where: { status: 'PENDENTE' },
      select: { id: true, nome: true, email: true, codigoPessoa: true, status: true, criadoEm: true },
      orderBy: { criadoEm: 'asc' },
    })
  }

  /**
   * Aprova a solicitação: cria o Usuario reaproveitando a senha já coletada
   * e marca a solicitação como APROVADA, em uma única transação.
   */
  static async aprovar(id: string, revisorId: string, perfil: Perfil = Perfil.APOIO_ACADEMICO) {
    return prisma.$transaction(async (tx) => {
      const solicitacao = await tx.solicitacaoAcesso.findUnique({ where: { id } })
      if (!solicitacao) throw new Error('Solicitação não encontrada.')
      if (solicitacao.status !== 'PENDENTE') throw new Error('Esta solicitação já foi revisada.')

      const emailExistente = await tx.usuario.findUnique({ where: { email: solicitacao.email } })
      if (emailExistente) throw new Error('Já existe um usuário cadastrado com este email.')

      const usuario = await tx.usuario.create({
        data: {
          nome: solicitacao.nome,
          email: solicitacao.email,
          senhaHash: solicitacao.senhaHash,
          codigoPessoa: solicitacao.codigoPessoa,
          perfil,
        },
        select: { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true },
      })

      await tx.solicitacaoAcesso.update({
        where: { id },
        data: { status: 'APROVADA', revisadoPorId: revisorId, revisadoEm: new Date() },
      })

      return usuario
    })
  }

  static async negar(id: string, revisorId: string, motivo?: string) {
    const solicitacao = await prisma.solicitacaoAcesso.findUnique({ where: { id } })
    if (!solicitacao) throw new Error('Solicitação não encontrada.')
    if (solicitacao.status !== 'PENDENTE') throw new Error('Esta solicitação já foi revisada.')

    return prisma.solicitacaoAcesso.update({
      where: { id },
      data: {
        status: 'REJEITADA',
        motivoRejeicao: motivo || null,
        revisadoPorId: revisorId,
        revisadoEm: new Date(),
      },
      select: { id: true, nome: true, email: true, status: true },
    })
  }
}