/*
  Warnings:

  - You are about to drop the column `dia` on the `solicitacoes_reserva` table. All the data in the column will be lost.
  - You are about to drop the column `horaFim` on the `solicitacoes_reserva` table. All the data in the column will be lost.
  - You are about to drop the column `horaInicio` on the `solicitacoes_reserva` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "solicitacoes_reserva" DROP COLUMN "dia",
DROP COLUMN "horaFim",
DROP COLUMN "horaInicio";

-- CreateTable
CREATE TABLE "datas_horario_reserva" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "dia" TIMESTAMP(3) NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "emConflito" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "datas_horario_reserva_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "datas_horario_reserva" ADD CONSTRAINT "datas_horario_reserva_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "solicitacoes_reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;
