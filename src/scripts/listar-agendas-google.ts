/**
 * Script utilitário: lista todas as agendas visíveis para a conta autenticada
 * (a mesma lista que aparece na imagem — "Coreu - Prédio 15", "Prédio 1 - Lab 505 (24)" etc.)
 * e ajuda a copiar o calendarId de cada uma para o campo Laboratorio.googleCalendarId.
 *
 * Execução:
 *   npx tsx scripts/listar-agendas-google.ts
 *
 * Pré-requisito: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN já no .env
 */
import { listarAgendasDisponiveis } from '../lib/google/calendar'
import { prisma } from '../lib/prisma/client'

async function main() {
  console.log('Buscando agendas disponíveis na conta Google autenticada...\n')

  const agendas = await listarAgendasDisponiveis()

  if (agendas.length === 0) {
    console.log('Nenhuma agenda encontrada. Verifique se a conta autenticada tem acesso às agendas dos laboratórios.')
    return
  }

  console.log(`Encontradas ${agendas.length} agenda(s):\n`)
  agendas.forEach((a, i) => {
    console.log(`${i + 1}. ${a.summary}`)
    console.log(`   calendarId: ${a.id}\n`)
  })

  // Tenta casar automaticamente pelo nome do laboratório (correspondência parcial)
  const laboratorios = await prisma.laboratorio.findMany({
    select: { id: true, nome: true, codigo: true, googleCalendarId: true },
  })

  console.log('─'.repeat(60))
  console.log('Sugestão de correspondência (verifique manualmente antes de aplicar):\n')

  for (const lab of laboratorios) {
    if (lab.googleCalendarId) {
      console.log(`✅ ${lab.nome} (${lab.codigo}) — já configurado: ${lab.googleCalendarId}`)
      continue
    }

    // Correspondência simples por substring do código/nome
    const candidata = agendas.find((a) =>
      a.summary.toLowerCase().includes(lab.codigo.toLowerCase()) ||
      a.summary.toLowerCase().includes(lab.nome.toLowerCase())
    )

    if (candidata) {
      console.log(`🔎 ${lab.nome} (${lab.codigo}) → possível match: "${candidata.summary}" (${candidata.id})`)
    } else {
      console.log(`⚠️  ${lab.nome} (${lab.codigo}) — nenhuma correspondência automática encontrada`)
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log('Para aplicar, rode o UPDATE manual no banco ou use o script:')
  console.log('  npx tsx scripts/vincular-calendario-laboratorio.ts <laboratorioId> <calendarId>')
}

main()
  .catch((err) => {
    console.error('Erro:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
