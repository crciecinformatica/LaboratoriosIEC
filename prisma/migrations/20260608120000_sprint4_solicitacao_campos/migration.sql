-- CreateEnum
CREATE TYPE "ModalidadeReserva" AS ENUM ('PRESENCIAL', 'REMOTO', 'RAS');

-- AlterTable: adiciona campos estruturados e remove descricao
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "modalidadeReserva" "ModalidadeReserva";
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "nomeProfessor" TEXT;
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "codigoPessoaProf" TEXT;
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "telefoneProf" TEXT;
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "curso" TEXT;
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "numOferta" TEXT;
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "numTurma" TEXT;
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "codigoDisciplina" TEXT;
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "nomeDisciplina" TEXT;
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "softwaresUtilizados" TEXT;
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "numeroAlunos" INTEGER;

-- Migra dados existentes de descricao para campos estruturados (valores padrão)
UPDATE "solicitacoes_reserva" SET
  "modalidadeReserva" = 'PRESENCIAL',
  "nomeProfessor" = 'Não informado',
  "curso" = 'Não informado',
  "codigoDisciplina" = 'N/A',
  "nomeDisciplina" = COALESCE("titulo", 'Não informado'),
  "softwaresUtilizados" = COALESCE("descricao", ''),
  "numeroAlunos" = 0
WHERE "modalidadeReserva" IS NULL;

ALTER TABLE "solicitacoes_reserva" ALTER COLUMN "modalidadeReserva" SET NOT NULL;
ALTER TABLE "solicitacoes_reserva" ALTER COLUMN "nomeProfessor" SET NOT NULL;
ALTER TABLE "solicitacoes_reserva" ALTER COLUMN "curso" SET NOT NULL;
ALTER TABLE "solicitacoes_reserva" ALTER COLUMN "codigoDisciplina" SET NOT NULL;
ALTER TABLE "solicitacoes_reserva" ALTER COLUMN "nomeDisciplina" SET NOT NULL;
ALTER TABLE "solicitacoes_reserva" ALTER COLUMN "softwaresUtilizados" SET NOT NULL;
ALTER TABLE "solicitacoes_reserva" ALTER COLUMN "numeroAlunos" SET NOT NULL;

ALTER TABLE "solicitacoes_reserva" DROP COLUMN "descricao";
