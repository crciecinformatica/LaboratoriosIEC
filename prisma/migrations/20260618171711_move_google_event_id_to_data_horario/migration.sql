/*
  Warnings:

  - You are about to drop the column `googleEventId` on the `solicitacoes_reserva` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "datas_horario_reserva" ADD COLUMN     "googleEventId" TEXT;

-- AlterTable
ALTER TABLE "solicitacoes_reserva" DROP COLUMN "googleEventId";
