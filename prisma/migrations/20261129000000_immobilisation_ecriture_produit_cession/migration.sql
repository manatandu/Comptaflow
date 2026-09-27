-- L'écriture du produit de cession est RETENUE par la fiche (audit final
-- F130) · supprimée depuis le journal, elle laissait le bien porter un prix
-- de cession qu'aucune écriture ne justifiait plus. RESTRICT, comme
-- l'écriture d'acquisition ; déclaré au schéma, Prisma posant SET NULL par
-- défaut sur une relation facultative.
ALTER TABLE "immobilisations" ADD COLUMN "ecritureProduitCessionId" TEXT;

CREATE UNIQUE INDEX "immobilisations_ecritureProduitCessionId_key" ON "immobilisations"("ecritureProduitCessionId");

ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_ecritureProduitCessionId_fkey" FOREIGN KEY ("ecritureProduitCessionId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
