-- LETTRAGE PROFESSIONNEL · CPCC, Notes de cours d'organisation comptable, ch. 6
--
-- Trois apports :
--   1. le lettrage PARTIEL, que le texte prévoit expressément (« la somme des
--      montants lettrés au débit pouvant être égale, supérieure ou inférieure
--      à celle des montants lettrés au crédit ») ;
--   2. la liste des comptes lettrables, que le texte laisse à l'entité ;
--   3. le verrouillage, la traçabilité de l'origine et l'écart de change
--      réalisé au dénouement.

CREATE TYPE "StatutLettrage" AS ENUM ('PARTIEL', 'SOLDE');
CREATE TYPE "OrigineLettrage" AS ENUM ('MANUEL', 'AUTOMATIQUE_PIECE', 'AUTOMATIQUE_MONTANT');

CREATE TABLE "lettrages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "statut" "StatutLettrage" NOT NULL,
    "solde" DECIMAL(18,2) NOT NULL,
    "origine" "OrigineLettrage" NOT NULL,
    "verrouille" BOOLEAN NOT NULL DEFAULT false,
    "ecartChange" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "soldeAt" TIMESTAMP(3),
    CONSTRAINT "lettrages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lettrages_compteId_code_key" ON "lettrages"("compteId", "code");
CREATE INDEX "lettrages_tenantId_statut_idx" ON "lettrages"("tenantId", "statut");

ALTER TABLE "lettrages" ADD CONSTRAINT "lettrages_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lettrages" ADD CONSTRAINT "lettrages_compteId_fkey"
  FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lignes_ecriture" ADD COLUMN "lettrageId" TEXT;
CREATE INDEX "lignes_ecriture_lettrageId_idx" ON "lignes_ecriture"("lettrageId");
ALTER TABLE "lignes_ecriture" ADD CONSTRAINT "lignes_ecriture_lettrageId_fkey"
  FOREIGN KEY ("lettrageId") REFERENCES "lettrages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "comptes" ADD COLUMN "lettrable" BOOLEAN NOT NULL DEFAULT false;

-- Comptes lettrables des dossiers EXISTANTS.
-- « Les principaux comptes pour lesquels le lettrage a un intérêt sont
-- principalement les comptes de tiers (classe 4) », mais l'exemple chiffré du
-- CPCC porte sur le compte 585 Virements internes : la classe 5 en 58 est donc
-- retenue elle aussi. S'y ajoute tout compte portant déjà des lignes lettrées,
-- pour qu'aucun dossier ne perde une possibilité dont il usait.
UPDATE "comptes" SET "lettrable" = true
WHERE "numero" LIKE '4%'
   OR "numero" LIKE '58%'
   OR "id" IN (SELECT DISTINCT "compteId" FROM "lignes_ecriture" WHERE "lettre" IS NOT NULL);

-- Reprise des lettrages déjà posés · un groupe SOLDE par (compte, lettre)
-- existant, pour que l'écran de lettrage les présente comme les nouveaux.
-- `createdBy` vaut 'reprise' : la piste d'audit dit franchement que
-- l'auteur d'origine n'était pas enregistré avant cette migration.
INSERT INTO "lettrages" ("id", "tenantId", "compteId", "code", "statut", "solde", "origine", "createdBy", "soldeAt")
SELECT gen_random_uuid(), c."tenantId", l."compteId", l."lettre", 'SOLDE', 0, 'MANUEL', 'reprise', NOW()
FROM (SELECT DISTINCT "compteId", "lettre" FROM "lignes_ecriture" WHERE "lettre" IS NOT NULL) l
JOIN "comptes" c ON c."id" = l."compteId";

UPDATE "lignes_ecriture" le
SET "lettrageId" = lt."id"
FROM "lettrages" lt
WHERE le."compteId" = lt."compteId" AND le."lettre" = lt."code";
