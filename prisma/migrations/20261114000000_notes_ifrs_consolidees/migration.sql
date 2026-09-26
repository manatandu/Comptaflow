-- Notes des états IFRS consolidés, dont IFRS 12 · déclarées à part de celles
-- des comptes individuels.

-- DropIndex
DROP INDEX "notes_ifrs_tenantId_exerciceId_key";

-- AlterTable
ALTER TABLE "notes_ifrs" ADD COLUMN     "consolide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ifrs12" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "notes_ifrs_tenantId_exerciceId_consolide_key" ON "notes_ifrs"("tenantId", "exerciceId", "consolide");

