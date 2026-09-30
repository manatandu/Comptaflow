-- AUSCOOP art. 19, 74, 77, 183, 205 et 268 · mentions de la coopérative.
CREATE TYPE "VarianteCooperative" AS ENUM ('SCOOPS', 'COOP_CA');

ALTER TABLE "tenants" ADD COLUMN "numeroRegistreCooperatives" TEXT;
ALTER TABLE "tenants" ADD COLUMN "varianteCooperative" "VarianteCooperative";
ALTER TABLE "tenants" ADD COLUMN "dateDissolution" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN "liquidateurs" TEXT;

-- La coopérative n'est pas au RCCM (art. 74) et ne peut être immatriculée à
-- plusieurs registres (art. 77 al. 1) · le seul champ qu'elle avait pour son
-- numéro était celui du RCCM, et ce qu'elle y a saisi est son numéro au
-- Registre des Sociétés Coopératives. Il change de colonne, rien ne se perd.
UPDATE "tenants"
SET "numeroRegistreCooperatives" = "rccm", "rccm" = NULL
WHERE "formeJuridiqueSyscohada" = 'SOCIETE_COOPERATIVE' AND "rccm" IS NOT NULL;
