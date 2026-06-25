-- CreateEnum
CREATE TYPE "AcaoLog" AS ENUM ('CRIAR', 'EDITAR', 'EXCLUIR', 'CONFIRMAR', 'REJEITAR', 'REAGENDAR', 'MARCAR_CONFLITO', 'UPLOAD_ANEXO', 'LOGIN', 'LOGOUT');

-- CreateEnum
CREATE TYPE "EntidadeLog" AS ENUM ('RESERVA', 'LABORATORIO', 'PROFESSOR', 'TURMA', 'USUARIO');

-- CreateTable
CREATE TABLE "logs_operacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "acao" "AcaoLog" NOT NULL,
    "entidade" "EntidadeLog" NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "metadados" JSONB,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_operacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "logs_operacao_usuarioId_idx" ON "logs_operacao"("usuarioId");

-- CreateIndex
CREATE INDEX "logs_operacao_entidade_idx" ON "logs_operacao"("entidade");

-- CreateIndex
CREATE INDEX "logs_operacao_entidadeId_idx" ON "logs_operacao"("entidadeId");

-- CreateIndex
CREATE INDEX "logs_operacao_criadoEm_idx" ON "logs_operacao"("criadoEm" DESC);

-- CreateIndex
CREATE INDEX "logs_operacao_acao_idx" ON "logs_operacao"("acao");

-- AddForeignKey
ALTER TABLE "logs_operacao" ADD CONSTRAINT "logs_operacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
