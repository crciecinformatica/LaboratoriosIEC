import { prisma } from '@/lib/prisma/client'
import type { AcaoLog, EntidadeLog, Prisma } from '@prisma/client'

export interface LogOperacaoInput {
  usuarioId:  string
  acao:       AcaoLog
  entidade:   EntidadeLog
  entidadeId: string
  descricao:  string
  metadados?: Prisma.InputJsonValue
  ip?:        string
}

/**
 * Registra uma operação no log de auditoria.
 *
 * Pode ser chamado com `await` (dentro de transação, onde a falha deve ser
 * propagada) ou sem await / via `.catch` (fire-and-forget quando a operação
 * principal já foi commitada e o log não deve bloquear o response).
 *
 * Exemplo síncrono (dentro de tx):
 *   await registrarLog({ usuarioId, acao: 'CRIAR', entidade: 'LABORATORIO', ... })
 *
 * Exemplo fire-and-forget (após commit):
 *   registrarLog({ ... }).catch(e => console.error('[AuditLog]', e))
 */
export async function registrarLog(input: LogOperacaoInput): Promise<void> {
  await prisma.logOperacao.create({
    data: {
      usuarioId:  input.usuarioId,
      acao:       input.acao,
      entidade:   input.entidade,
      entidadeId: input.entidadeId,
      descricao:  input.descricao,
      metadados:  input.metadados ?? undefined,
      ip:         input.ip,
    },
  })
}

/**
 * Extrai o IP do request de forma segura (considera proxies reversos).
 */
export function extrairIp(req: Request): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? undefined
}