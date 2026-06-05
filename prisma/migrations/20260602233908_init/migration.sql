-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('APOIO_ACADEMICO', 'OPERADOR_TI', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "StatusReserva" AS ENUM ('CRIADA', 'AGUARDANDO_CONFIRMACAO', 'CONFIRMADA', 'CONFLITO_DE_DATAS', 'REJEITADA');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('CRIACAO', 'ENVIO_CSC', 'NOTIFICACAO_TEAMS', 'CONFIRMACAO', 'REJEICAO', 'CONFLITO_DETECTADO', 'REAGENDAMENTO', 'GOOGLE_CALENDAR_CRIADO', 'GOOGLE_CALENDAR_ATUALIZADO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL DEFAULT 'APOIO_ACADEMICO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "matricula" TEXT,
    "departamento" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turmas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "semestre" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turmas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laboratorios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "capacidade" INTEGER NOT NULL,
    "recursos" TEXT[],
    "localizacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "laboratorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_reserva" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "StatusReserva" NOT NULL DEFAULT 'CRIADA',
    "motivoRejeicao" TEXT,
    "cscProtocolo" TEXT,
    "googleEventId" TEXT,
    "solicitanteId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "laboratorioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitacoes_reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datas_horario_reserva" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "datas_horario_reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_tramitacao" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "evento" "TipoEvento" NOT NULL,
    "statusAntes" "StatusReserva",
    "statusDepois" "StatusReserva",
    "observacao" TEXT,
    "metadados" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_tramitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexos" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_integracao" (
    "id" TEXT NOT NULL,
    "servico" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "payload" JSONB,
    "resposta" JSONB,
    "statusHttp" INTEGER,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_integracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_sessionToken_key" ON "sessoes"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "professores_email_key" ON "professores"("email");

-- CreateIndex
CREATE UNIQUE INDEX "professores_matricula_key" ON "professores"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "turmas_codigo_key" ON "turmas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "laboratorios_codigo_key" ON "laboratorios"("codigo");

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "professores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_reserva" ADD CONSTRAINT "solicitacoes_reserva_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_reserva" ADD CONSTRAINT "solicitacoes_reserva_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "professores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_reserva" ADD CONSTRAINT "solicitacoes_reserva_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_reserva" ADD CONSTRAINT "solicitacoes_reserva_laboratorioId_fkey" FOREIGN KEY ("laboratorioId") REFERENCES "laboratorios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datas_horario_reserva" ADD CONSTRAINT "datas_horario_reserva_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "solicitacoes_reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_tramitacao" ADD CONSTRAINT "historico_tramitacao_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "solicitacoes_reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_tramitacao" ADD CONSTRAINT "historico_tramitacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "solicitacoes_reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;
