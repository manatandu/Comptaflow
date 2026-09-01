-- Determination du resultat fiscal · dossiers SYSCOHADA uniquement.
--
-- Loi n° 23/053 art. 9 : le benefice imposable est l'excedent des produits
-- sur les charges en application de la legislation comptable, sous reserve
-- des dispositions fiscales contraires. Les retraitements sont SAISIS, pas
-- deduits des ecritures : le logiciel ne qualifie pas une charge de non
-- deductible a la place du comptable.
CREATE TYPE "SensRetraitementFiscal" AS ENUM ('REINTEGRATION', 'DEDUCTION');
CREATE TYPE "NatureActiviteFiscale" AS ENUM ('VENTE', 'PRESTATIONS');

CREATE TABLE "retraitements_fiscaux" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "exerciceId"  TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "sens"        "SensRetraitementFiscal" NOT NULL,
  "libelle"     TEXT NOT NULL,
  "montant"     DECIMAL(18,2) NOT NULL,
  "commentaire" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "retraitements_fiscaux_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "retraitements_fiscaux_tenantId_exerciceId_idx"
  ON "retraitements_fiscaux"("tenantId", "exerciceId");

ALTER TABLE "retraitements_fiscaux"
  ADD CONSTRAINT "retraitements_fiscaux_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "retraitements_fiscaux"
  ADD CONSTRAINT "retraitements_fiscaux_exerciceId_fkey"
  FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les deux donnees fiscales de l'exercice qui ne se deduisent d'aucune
-- ecriture : les acomptes deja verses, et le deficit venu d'avant OmegaX.
CREATE TABLE "dossiers_fiscaux_exercice" (
  "id"                    TEXT NOT NULL,
  "tenantId"              TEXT NOT NULL,
  "exerciceId"            TEXT NOT NULL,
  "acomptesVerses"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  "deficitAnterieurSaisi" DECIMAL(18,2),
  "natureActivite"        "NatureActiviteFiscale",
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dossiers_fiscaux_exercice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dossiers_fiscaux_exercice_exerciceId_key"
  ON "dossiers_fiscaux_exercice"("exerciceId");
CREATE INDEX "dossiers_fiscaux_exercice_tenantId_idx"
  ON "dossiers_fiscaux_exercice"("tenantId");

ALTER TABLE "dossiers_fiscaux_exercice"
  ADD CONSTRAINT "dossiers_fiscaux_exercice_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dossiers_fiscaux_exercice"
  ADD CONSTRAINT "dossiers_fiscaux_exercice_exerciceId_fkey"
  FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
