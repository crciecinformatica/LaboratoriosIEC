import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // Usuários por perfil
  const senhaHash = await bcrypt.hash('Senha@123', 12)

  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@iec.edu.br' },
    update: {},
    create: { nome: 'Administrador IEC', email: 'admin@iec.edu.br', senhaHash, perfil: 'ADMINISTRADOR' },
  })

  const operador = await prisma.usuario.upsert({
    where: { email: 'operador.ti@iec.edu.br' },
    update: { codigoPessoa: '288319' },
    create: { nome: 'Operador TI', email: 'operador.ti@iec.edu.br', senhaHash, perfil: 'OPERADOR_TI', codigoPessoa: '288319' },
  })

  const apoio = await prisma.usuario.upsert({
    where: { email: 'apoio@iec.edu.br' },
    update: {},
    create: { nome: 'Apoio Acadêmico', email: 'apoio@iec.edu.br', senhaHash, perfil: 'APOIO_ACADEMICO' },
  })

  console.log(`✅ Usuários criados: ${admin.email}, ${operador.email}, ${apoio.email}`)

  // Laboratórios
  const labs = await Promise.all([
    prisma.laboratorio.upsert({
      where: { codigo: 'LAB-INFO-01' },
      update: {},
      create: { nome: 'Laboratório de Informática 1', codigo: 'LAB-INFO-01', capacidade: 30, recursos: ['Computadores', 'Projetor', 'Ar-condicionado'], localizacao: 'Bloco A, Sala 101' },
    }),
    prisma.laboratorio.upsert({
      where: { codigo: 'LAB-INFO-02' },
      update: {},
      create: { nome: 'Laboratório de Informática 2', codigo: 'LAB-INFO-02', capacidade: 25, recursos: ['Computadores', 'Lousa digital'], localizacao: 'Bloco A, Sala 102' },
    }),
    prisma.laboratorio.upsert({
      where: { codigo: 'LAB-REDES-01' },
      update: {},
      create: { nome: 'Laboratório de Redes', codigo: 'LAB-REDES-01', capacidade: 20, recursos: ['Switches', 'Roteadores', 'Rack de servidores'], localizacao: 'Bloco B, Sala 201' },
    }),
  ])

  console.log(`✅ Laboratórios criados: ${labs.map(l => l.codigo).join(', ')}`)

  // Professores
  const professor = await prisma.professor.upsert({
    where: { email: 'prof.silva@iec.edu.br' },
    update: {},
    create: { nome: 'Prof. Carlos Silva', email: 'prof.silva@iec.edu.br', matricula: 'P001', telefone: '(11) 98765-4321', departamento: 'Tecnologia da Informação' },
  })

  // Turma
  const turma = await prisma.turma.upsert({
    where: { codigo: 'TI-2024-1' },
    update: {},
    create: {
      codigo: 'TI-2024-1',
      nome: 'Programação Web',
      semestre: '2024/1',
      curso: 'Tecnologia da Informação',
      numOferta: '10001',
      codigoDisciplina: 'INF201',
      professorId: professor.id,
    },
  })

  console.log(`✅ Professor: ${professor.nome} | Turma: ${turma.codigo}`)
  console.log('\n✅ Seed concluído!')
  console.log('\nCredenciais de acesso:')
  console.log('  admin@iec.edu.br       → ADMINISTRADOR')
  console.log('  operador.ti@iec.edu.br → OPERADOR_TI')
  console.log('  apoio@iec.edu.br       → APOIO_ACADEMICO')
  console.log('  Senha (todos): Senha@123')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
