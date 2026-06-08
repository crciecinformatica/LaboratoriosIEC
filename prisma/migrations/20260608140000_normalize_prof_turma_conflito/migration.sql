-- Professor: telefone
ALTER TABLE "professores" ADD COLUMN "telefone" TEXT;

-- Turma: dados acadêmicos
ALTER TABLE "turmas" ADD COLUMN "curso" TEXT;
ALTER TABLE "turmas" ADD COLUMN "numOferta" TEXT;
ALTER TABLE "turmas" ADD COLUMN "codigoDisciplina" TEXT;

UPDATE "turmas" SET
  "curso" = 'Não informado',
  "codigoDisciplina" = "codigo"
WHERE "curso" IS NULL;

ALTER TABLE "turmas" ALTER COLUMN "curso" SET NOT NULL;
ALTER TABLE "turmas" ALTER COLUMN "codigoDisciplina" SET NOT NULL;

-- Migrar dados acadêmicos da solicitação para turma vinculada
UPDATE "turmas" t SET
  "curso" = s."curso",
  "numOferta" = s."numOferta",
  "codigoDisciplina" = s."codigoDisciplina",
  "nome" = s."nomeDisciplina"
FROM "solicitacoes_reserva" s
WHERE s."turmaId" = t."id"
  AND s."curso" IS NOT NULL
  AND s."curso" != 'Não informado';

UPDATE "professores" p SET
  "telefone" = s."telefoneProf",
  "matricula" = COALESCE(p."matricula", s."codigoPessoaProf")
FROM "solicitacoes_reserva" s
WHERE s."professorId" = p."id"
  AND (s."telefoneProf" IS NOT NULL OR s."codigoPessoaProf" IS NOT NULL);

-- DataHorarioReserva: flag de conflito
ALTER TABLE "datas_horario_reserva" ADD COLUMN "emConflito" BOOLEAN NOT NULL DEFAULT false;

-- Remover campos duplicados da solicitação
ALTER TABLE "solicitacoes_reserva" DROP COLUMN "nomeProfessor";
ALTER TABLE "solicitacoes_reserva" DROP COLUMN "codigoPessoaProf";
ALTER TABLE "solicitacoes_reserva" DROP COLUMN "telefoneProf";
ALTER TABLE "solicitacoes_reserva" DROP COLUMN "curso";
ALTER TABLE "solicitacoes_reserva" DROP COLUMN "numOferta";
ALTER TABLE "solicitacoes_reserva" DROP COLUMN "numTurma";
ALTER TABLE "solicitacoes_reserva" DROP COLUMN "codigoDisciplina";
ALTER TABLE "solicitacoes_reserva" DROP COLUMN "nomeDisciplina";
