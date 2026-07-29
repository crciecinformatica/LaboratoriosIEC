-- AlterEnum
ALTER TYPE "TipoEvento" ADD VALUE 'ENVIO_EMAIL';

-- AlterTable
ALTER TABLE "solicitacoes_reserva" ADD COLUMN "cscProtocoloPracaLiberdade" TEXT;
