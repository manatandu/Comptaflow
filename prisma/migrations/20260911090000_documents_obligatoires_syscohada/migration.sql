-- Documents obligatoires du chemin SYSCOHADA · livre d'inventaire (AUDCIF
-- art. 19) et rapport de gestion (AUSCGIE art. 138, AUSCOOP art. 108).
-- Écrite à la main comme toutes les migrations de ce dépôt.

-- Le jeu d'états du SYCEBNL n'a pas de sens pour une société commerciale ·
-- il devient facultatif, et le système comptable SYSCOHADA le remplace sur
-- l'autre chemin. Les transcriptions existantes gardent leur valeur.
ALTER TABLE "transcriptions_inventaire" ALTER COLUMN "jeu" DROP NOT NULL;
ALTER TABLE "transcriptions_inventaire" ADD COLUMN "systemeSyscohada" "SystemeComptableSyscohada";

-- Le rapport de gestion de l'AUSCGIE compte six sections, celui de l'AUSCOOP
-- six autres · les quatre colonnes nommées du rapport d'activité SYCEBNL
-- portent la citation de SON article et ne peuvent pas les accueillir.
ALTER TABLE "rapports_activite" ADD COLUMN "sections" JSONB;
ALTER TABLE "rapports_activite" ADD COLUMN "sourceRegle" TEXT;
