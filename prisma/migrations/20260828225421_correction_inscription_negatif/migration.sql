-- AlterTable
ALTER TABLE "ecritures" ADD COLUMN     "corrigeEcritureId" TEXT,
ADD COLUMN     "motifCorrection" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ecritures_corrigeEcritureId_key" ON "ecritures"("corrigeEcritureId");

-- AddForeignKey
ALTER TABLE "ecritures" ADD CONSTRAINT "ecritures_corrigeEcritureId_fkey" FOREIGN KEY ("corrigeEcritureId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

