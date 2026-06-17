/**
 * Vincula um laboratório a uma agenda específica do Google Calendar.
 *
 * Execução:
 *   npx tsx scripts/vincular-calendario-laboratorio.ts <laboratorioId> <calendarId>
 *
 * Exemplo:
 *   npx tsx scripts/vincular-calendario-laboratorio.ts clx1a2b3c4 c_abc123@group.calendar.google.com
 */
import { prisma } from '../lib/prisma/client'

async function main() {
  const [laboratorioId, calendarId] = process.argv.slice(2)

  if (!laboratorioId || !calendarId) {
    console.error('Uso: npx tsx scripts/vincular-calendario-laboratorio.ts <laboratorioId> <calendarId>')
    process.exit(1)
  }

  const lab = await prisma.laboratorio.update({
    where: { id: laboratorioId },
    data:  { googleCalendarId: calendarId },
  })

  console.log(`✅ Laboratório "${lab.nome}" (${lab.codigo}) vinculado à agenda: ${calendarId}`)
}

main()
  .catch((err) => {
    console.error('Erro ao vincular agenda:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
