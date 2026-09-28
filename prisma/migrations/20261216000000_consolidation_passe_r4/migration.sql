-- AUDCIF art. 76 · identité des entités hors OHADA qui contrôlent la consolidante.
ALTER TABLE "faits_consolidation_exercice" ADD COLUMN "entitesControleHorsOhada" TEXT;

-- D4C ch. XII-5 § 4 · les dividendes internes se DÉCLARENT, zéro compris · NULL
-- veut dire « pas de réponse ». Les lignes existantes gardent leur valeur.
ALTER TABLE "liens_participation_consolidation" ALTER COLUMN "dividendesExercice" DROP DEFAULT;
ALTER TABLE "liens_participation_consolidation" ALTER COLUMN "dividendesExercice" DROP NOT NULL;
