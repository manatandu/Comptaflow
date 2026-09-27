-- Audit final de la 1.0, F4 et F5 · l'écriture qui solde les classes 6 à 8
-- et le report à-nouveau portaient le même drapeau.
ALTER TABLE "ecritures" ADD COLUMN "estSoldeDesComptesDeGestion" BOOLEAN NOT NULL DEFAULT false;

-- Seule la clôture annuelle crée cette écriture, sous ce libellé et à la
-- date de fin de son exercice.
UPDATE "ecritures" e
SET "estSoldeDesComptesDeGestion" = true
FROM "exercices" x
WHERE e."exerciceId" = x."id"
  AND e."estGenereeParCloture" = true
  AND e."estANouveauProvisoire" = false
  AND e."date" = x."dateFin"
  AND e."libelle" LIKE 'Clôture des charges/produits%';

-- Les deux écritures de la clôture entraient au BROUILLARD et l'écriture de
-- solde ne pouvait plus être validée, son exercice étant clos. Elles sont
-- calculées sur le seul livre-journal (la clôture refuse tout brouillard) et
-- entrent désormais validées (AUDCIF art. 22, 2°). Rattrapage des écritures
-- déjà passées, reconnues à leur libellé, jamais le report provisoire ni un
-- bilan d'ouverture importé.
UPDATE "ecritures"
SET "statut" = 'VALIDEE', "valideeAt" = COALESCE("valideeAt", "createdAt"), "valideeBy" = COALESCE("valideeBy", "createdBy")
WHERE "estGenereeParCloture" = true
  AND "estANouveauProvisoire" = false
  AND "statut" = 'BROUILLARD'
  AND ("libelle" LIKE 'Clôture des charges/produits%' OR "libelle" LIKE 'Report à-nouveau · ouverture exercice%');
