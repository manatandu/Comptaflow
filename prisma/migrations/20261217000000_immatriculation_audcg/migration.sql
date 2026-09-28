-- AUDCG art. 62 et 140 · passe O2.
ALTER TABLE "tenants" ADD COLUMN "numeroDeclarationActivite" TEXT;
ALTER TABLE "tenants" ADD COLUMN "locataireGerantFonds" BOOLEAN;

-- L'entreprenant n'a pas de RCCM (art. 64) · le seul champ qu'il avait pour
-- son numéro était celui du RCCM, et ce qu'il y a saisi est son numéro de
-- déclaration d'activité. Il change de colonne, rien ne se perd.
UPDATE "tenants"
SET "numeroDeclarationActivite" = "rccm", "rccm" = NULL
WHERE "formeJuridiqueSyscohada" = 'ENTREPRENANT' AND "rccm" IS NOT NULL;
