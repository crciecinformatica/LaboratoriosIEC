/*
  Warnings:

  - You are about to drop the `datas_horario_reserva` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `dia` to the `solicitacoes_reserva` table without a default value. This is not possible if the table is not empty.
  - Added the required column `horaFim` to the `solicitacoes_reserva` table without a default value. This is not possible if the table is not empty.
  - Added the required column `horaInicio` to the `solicitacoes_reserva` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "datas_horario_reserva" DROP CONSTRAINT "datas_horario_reserva_reservaId_fkey";

-- AlterTable
ALTER TABLE "solicitacoes_reserva" ADD COLUMN     "dia" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "horaFim" TEXT NOT NULL,
ADD COLUMN     "horaInicio" TEXT NOT NULL;

-- DropTable
DROP TABLE "datas_horario_reserva";
