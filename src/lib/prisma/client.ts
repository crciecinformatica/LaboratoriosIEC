import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getDatabaseUrl() {
  if (!process.env.DATABASE_URL) return process.env.DATABASE_URL
  
  const url = new URL(process.env.DATABASE_URL)
  
  // Em Serverless (produção), limitamos as conexões para evitar esgotar o pool de sessão
  if (process.env.NODE_ENV === 'production' && !url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', '1')
  }
  
  return url.toString()
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
    datasources: { db: { url: getDatabaseUrl() } },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma