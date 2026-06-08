/*
  Warnings:

  - A unique constraint covering the columns `[codigoPessoa]` on the table `usuarios` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `codigoPessoa` to the `usuarios` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "codigoPessoa" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_codigoPessoa_key" ON "usuarios"("codigoPessoa");
