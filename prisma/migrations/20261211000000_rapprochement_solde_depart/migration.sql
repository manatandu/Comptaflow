-- Rapprochement bancaire · solde de départ déclaré, en-cours d'ouverture et
-- réouverture motivée. Le premier rapprochement d'un compte partait de zéro
-- et pointait l'à-nouveau du premier exercice · un bilan d'ouverture importé
-- sur un autre exercice devenait impointable. Le départ se lit désormais sur
-- le relevé, et les opérations du livre que la banque n'a pas encore passées
-- se déclarent à part. Aucune ligne existante ne change · les colonnes
-- nouvelles sont nulles sur les rapprochements d'avant la règle.

-- AlterTable
ALTER TABLE "rapprochements_bancaires" ADD COLUMN "soldeDepartDeclare" DECIMAL(18,2);
ALTER TABLE "rapprochements_bancaires" ADD COLUMN "dateDepart" TIMESTAMP(3);
ALTER TABLE "rapprochements_bancaires" ADD COLUMN "rouvertAt" TIMESTAMP(3);
ALTER TABLE "rapprochements_bancaires" ADD COLUMN "rouvertBy" TEXT;
ALTER TABLE "rapprochements_bancaires" ADD COLUMN "motifReouverture" TEXT;

-- CreateTable
CREATE TABLE "encours_ouverture_rapprochement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "declareSurId" TEXT NOT NULL,
    "pointeSurId" TEXT,
    "ligneReleveId" TEXT,
    "libelle" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "encours_ouverture_rapprochement_pkey" PRIMARY KEY ("id")
);

-- Un en-cours se lit par le dossier et le rapprochement qui le déclare
-- (audit final F261 · l'index commence par le dossier).
CREATE INDEX "encours_ouverture_rapprochement_tenantId_declareSurId_idx" ON "encours_ouverture_rapprochement"("tenantId", "declareSurId");

-- CreateIndex
CREATE INDEX "encours_ouverture_rapprochement_pointeSurId_idx" ON "encours_ouverture_rapprochement"("pointeSurId");

-- CreateIndex
CREATE INDEX "encours_ouverture_rapprochement_ligneReleveId_idx" ON "encours_ouverture_rapprochement"("ligneReleveId");

-- AddForeignKey
ALTER TABLE "encours_ouverture_rapprochement" ADD CONSTRAINT "encours_ouverture_rapprochement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encours_ouverture_rapprochement" ADD CONSTRAINT "encours_ouverture_rapprochement_declareSurId_fkey" FOREIGN KEY ("declareSurId") REFERENCES "rapprochements_bancaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encours_ouverture_rapprochement" ADD CONSTRAINT "encours_ouverture_rapprochement_pointeSurId_fkey" FOREIGN KEY ("pointeSurId") REFERENCES "rapprochements_bancaires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encours_ouverture_rapprochement" ADD CONSTRAINT "encours_ouverture_rapprochement_ligneReleveId_fkey" FOREIGN KEY ("ligneReleveId") REFERENCES "lignes_releve_bancaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;
