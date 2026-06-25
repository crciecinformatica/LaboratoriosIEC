import { Perfil } from '@prisma/client'

export const permissoes = {
  reservas: {
    criar:     [Perfil.APOIO_ACADEMICO, Perfil.ADMINISTRADOR],
    listar:    [Perfil.APOIO_ACADEMICO, Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    confirmar: [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    rejeitar:  [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    deletar:   [Perfil.ADMINISTRADOR],
  },
  laboratorios: {
    criar:  [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    listar: [Perfil.APOIO_ACADEMICO, Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    editar: [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    deletar:[Perfil.ADMINISTRADOR],
  },
  professores: {
    criar:  [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    listar: [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    editar: [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    deletar:[Perfil.ADMINISTRADOR],
  },
  turmas: {
    criar:  [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    listar: [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    editar: [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    deletar:[Perfil.ADMINISTRADOR],
  },
  usuarios: {
    criar:  [Perfil.ADMINISTRADOR],
    listar: [Perfil.ADMINISTRADOR],
    editar: [Perfil.ADMINISTRADOR],
    deletar:[Perfil.ADMINISTRADOR],
  },
  integracoes: {
    configurar: [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    logs:       [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
  },
  // Relatórios: operadores e admins veem tudo; apoio acadêmico não tem acesso
  relatorios: {
    visualizar: [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
    exportar:   [Perfil.OPERADOR_TI, Perfil.ADMINISTRADOR],
  },
  // Log de auditoria de operações: apenas administradores
  auditoria: {
    visualizar: [Perfil.ADMINISTRADOR],
  },
} as const

export type Recurso = keyof typeof permissoes
export type Acao<R extends Recurso> = keyof (typeof permissoes)[R]

export function temPermissao<R extends Recurso>(
  perfil: Perfil,
  recurso: R,
  acao: Acao<R>
): boolean {
  const permitidos = permissoes[recurso][acao] as readonly Perfil[]
  return permitidos.includes(perfil)
}