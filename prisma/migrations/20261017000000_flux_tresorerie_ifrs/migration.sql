-- CreateEnum
CREATE TYPE "CategorieEffetChangeIfrs" AS ENUM ('OPERATIONNELLE', 'INVESTISSEMENT', 'FINANCEMENT');

-- AlterTable
ALTER TABLE "parametres_ifrs" ADD COLUMN     "decouvertsDansTresorerie" BOOLEAN,
ADD COLUMN     "tresorerieEnDevises" BOOLEAN;

-- CreateTable
CREATE TABLE "effets_change_tresorerie_ifrs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "categorie" "CategorieEffetChangeIfrs" NOT NULL,
    "justification" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "effets_change_tresorerie_ifrs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "effets_change_tresorerie_ifrs_tenantId_exerciceId_key" ON "effets_change_tresorerie_ifrs"("tenantId", "exerciceId");

-- AddForeignKey
ALTER TABLE "effets_change_tresorerie_ifrs" ADD CONSTRAINT "effets_change_tresorerie_ifrs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "effets_change_tresorerie_ifrs" ADD CONSTRAINT "effets_change_tresorerie_ifrs_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

