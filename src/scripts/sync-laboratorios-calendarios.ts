/**
 * Sincroniza os laboratórios reais (a partir da lista de agendas do Google
 * Calendar fornecida) com a tabela `laboratorios`, já vinculando o
 * googleCalendarId de cada um.
 *
 * Use este script no lugar de mapear manualmente um a um — ele resolve a
 * criação do laboratório (se ainda não existir) E o vínculo da agenda numa
 * única operação idempotente (upsert).
 *
 * Execução:
 *   npx tsx scripts/sync-laboratorios-calendarios.ts
 *
 * Pré-requisito: migration add_google_calendar_id_laboratorio já aplicada.
 */
import { prisma } from '../lib/prisma/client'

// ─── Mapa: laboratório físico → calendarId ────────────────────────────────────
// Construído a partir da lista de agendas fornecida (conta informaticaiec.crc@gmail.com).
// Agendas que NÃO representam um laboratório físico de reserva (Eventos, Teste,
// SERVIDOR RAS) foram deixadas FORA deste mapa — ver seção "Agendas ignoradas" abaixo.

interface LaboratorioSeed {
  codigo:           string   // código único interno do sistema
  nome:             string   // nome de exibição
  capacidade:       number   // extraído do "(NN)" no nome da agenda, quando presente
  localizacao:      string   // prédio
  googleCalendarId: string
}

const LABORATORIOS: LaboratorioSeed[] = [
  {
    codigo: 'COREU-P34-LAB01',
    nome:   'Coreu - Prédio 34 - LAB 01',
    capacidade: 30,
    localizacao: 'Prédio 34',
    googleCalendarId: '4bfc5765398893da763e23aee1f054d3c8e2fe4070a2313a5685675dabd944e4@group.calendar.google.com',
  },
  {
    codigo: 'COREU-P15-LAB202',
    nome:   'Coreu - Prédio 15 - LAB 202',
    capacidade: 30,
    localizacao: 'Prédio 15',
    googleCalendarId: 'a3aecfd5ba6a3c6ae52fffdcecce60ce4d425fc37449594936b4f475435257a3@group.calendar.google.com',
  },
  {
    codigo: 'COREU-P15-LAB302',
    nome:   'Coreu - Prédio 15 - LAB 302',
    capacidade: 0, // não informado na lista — ajuste manualmente se souber
    localizacao: 'Prédio 15',
    googleCalendarId: '8024bd566d62691eb11f109aa0837148ac7c7e91d03de9c6fe6d6a18537f85f5@group.calendar.google.com',
  },
  {
    codigo: 'COREU-P9-LAB202',
    nome:   'Coreu - Prédio 9 - LAB 202',
    capacidade: 0, // não informado na lista — ajuste manualmente se souber
    localizacao: 'Prédio 9',
    googleCalendarId: '34ce8cfd9de7dc87773dd7fe2ec0ec138e1c011ec49117533d2d90aefb7a81e8@group.calendar.google.com',
  },
  {
    codigo: 'P1-LAB505',
    nome:   'Prédio 1 - Lab 505',
    capacidade: 24,
    localizacao: 'Prédio 1',
    googleCalendarId: '0f092022508cda3aed64b8f693ac36cb16f9920ba6ff788e63c4d3bc78e1106b@group.calendar.google.com',
  },
  {
    codigo: 'P1-LAB506',
    nome:   'Prédio 1 - Lab 506',
    capacidade: 23,
    localizacao: 'Prédio 1',
    googleCalendarId: '7f01b7d31b20af21ffdaa6bf0173fb3fd8e3bd242908b8555d3675733f90a4a7@group.calendar.google.com',
  },
  {
    codigo: 'P1-LAB507',
    nome:   'Prédio 1 - Lab 507',
    capacidade: 23,
    localizacao: 'Prédio 1',
    googleCalendarId: '278f68144e5725331d32e5ecf86764b95296638a1b3b25b31aa8904a04a2da79@group.calendar.google.com',
  },
  {
    codigo: 'P1-LAB603',
    nome:   'Prédio 1 - Lab 603',
    capacidade: 31,
    localizacao: 'Prédio 1',
    googleCalendarId: 'be89c39da37665ba02d197a36959033837aebec9568a6032c5d2075cf0224821@group.calendar.google.com',
  },
  {
    codigo: 'P3-LAB1501',
    nome:   'Prédio 3 - Lab 1501',
    capacidade: 29,
    localizacao: 'Prédio 3',
    googleCalendarId: 'd35caad2367b4e764381f33ddedfdfd914aa8615491aa271d9c55c4a1d32d85d@group.calendar.google.com',
  },
  {
    codigo: 'P3-LAB1502',
    nome:   'Prédio 3 - Lab 1502',
    capacidade: 24,
    localizacao: 'Prédio 3',
    googleCalendarId: '964a326fa791919dc9176c9c7b507e1be413bfb80fe27e7a808b72649eb54d9b@group.calendar.google.com',
  },
  {
    codigo: 'P3-LAB801',
    nome:   'Prédio 3 - Lab 801',
    capacidade: 30,
    localizacao: 'Prédio 3',
    googleCalendarId: 'c454ac223272c90c3a7c5f8cf0f1f9a12b2da80e3bb2aac4d38821d27e5bee3a@group.calendar.google.com',
  },
  {
    codigo: 'SEDE-LAB206',
    nome:   'Prédio Sede - Lab 206',
    capacidade: 31,
    localizacao: 'Prédio Sede',
    googleCalendarId: '34124598ca3b944b9ca7b582e3d13d5ebb2cd4dd868091ae328176c8d5431274@group.calendar.google.com',
  },
  {
    codigo: 'SEDE-LAB207',
    nome:   'Prédio Sede - Lab 207',
    capacidade: 0, // não informado na lista — ajuste manualmente se souber
    localizacao: 'Prédio Sede',
    googleCalendarId: 'bf8b43e7267b3bebd212d6e5ac922ebf2783979de0ea7423521c0b15fcde5f5f@group.calendar.google.com',
  },
  {
    codigo: 'LAB-TESTE',
    nome:   'Laboratório de Teste',
    capacidade: 30, // não informado na lista — ajuste manualmente se souber
    localizacao: 'Prédio Teste',
    googleCalendarId: 'cb4bf6a14bebff6f1360864492ec80b091301f6a22b7a1e0c029e620681d10b7@group.calendar.google.com',
  },
]

// ─── Agendas ignoradas de propósito (não são laboratórios de reserva) ────────
// "Eventos"            → agenda institucional genérica, não é um lab físico
// "Teste reservas app" → agenda de testes do próprio time de desenvolvimento
// "SERVIDOR RAS"        → não é um laboratório físico reservável por turma
//
// Se algum desses precisar ser tratado como reservável no futuro, adicione-o
// ao array LABORATORIOS acima com o calendarId correspondente:
//   Eventos:             b269467e5db96da0e437b8ff00bd797c647ab86ff58907a5479e00d68323bd0e@group.calendar.google.com
//   Teste reservas app:  cb4bf6a14bebff6f1360864492ec80b091301f6a22b7a1e0c029e620681d10b7@group.calendar.google.com
//   SERVIDOR RAS:        b7dc0fec0dbb6d888272c7ca71b003dab4846a791276852992a9721ed86411c1@group.calendar.google.com

async function main() {
  console.log(`🔄 Sincronizando ${LABORATORIOS.length} laboratório(s)...\n`)

  for (const lab of LABORATORIOS) {
    const capacidadeFinal = lab.capacidade > 0 ? lab.capacidade : 30 // fallback razoável

    const resultado = await prisma.laboratorio.upsert({
      where:  { codigo: lab.codigo },
      update: {
        nome:             lab.nome,
        localizacao:      lab.localizacao,
        googleCalendarId: lab.googleCalendarId,
        ...(lab.capacidade > 0 ? { capacidade: lab.capacidade } : {}),
      },
      create: {
        codigo:           lab.codigo,
        nome:             lab.nome,
        capacidade:       capacidadeFinal,
        recursos:         ['Computadores'],
        localizacao:      lab.localizacao,
        googleCalendarId: lab.googleCalendarId,
      },
    })

    const avisoCapacidade = lab.capacidade === 0
      ? '  ⚠️  capacidade não informada na lista original, usando valor padrão (30) — ajuste manualmente se necessário'
      : ''

    console.log(`✅ ${resultado.nome} (${resultado.codigo}) → agenda vinculada${avisoCapacidade}`)
  }

  console.log('\n✨ Sincronização concluída.')
  console.log('\nLaboratórios SEM dados de capacidade reais na lista original (ajustar manualmente se souber):')
  LABORATORIOS.filter((l) => l.capacidade === 0).forEach((l) => console.log(`  - ${l.nome} (${l.codigo})`))
}

main()
  .catch((err) => {
    console.error('❌ Erro na sincronização:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())