-- Lot 10 · incorporels à durée d'utilité non limitée et bascule prospective.
-- AUDCIF Titre VIII ch. 2 § 1.3.3, § 3.2.2 c, § 4.2.2, § 7.2.2.1.

CREATE TYPE "FondementDureeDixAns" AS ENUM ('NON_ESTIMABLE', 'SIMPLIFICATION_SMT');

ALTER TABLE "immobilisations"
  ADD COLUMN "dureeNonLimitee" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "justificationDureeNonLimitee" TEXT,
  ADD COLUMN "dateDebutAmortissement" TIMESTAMP(3),
  ADD COLUMN "motifDureeLimitee" TEXT,
  ADD COLUMN "testDepreciationBascule" TEXT,
  ADD COLUMN "fondementDureeDixAns" "FondementDureeDixAns";
