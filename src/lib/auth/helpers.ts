import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from './config'
import { Perfil } from '@prisma/client'

/**
 * Retorna null se autorizado, ou um NextResponse 403 pronto para retornar.
 * Uso: const denied = await requirePerfil(['ADMINISTRADOR'])
 *      if (denied) return denied
 */
export async function requirePerfil(perfis: Perfil[]): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions)
  const perfil = session?.user?.perfil as Perfil | undefined
  if (!perfil || !perfis.includes(perfil)) {
    return NextResponse.json(
      { error: 'Acesso negado.' },
      { status: 403 }
    )
  }
  return null
}