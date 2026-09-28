-- Modules activables par dossier (tenant/modules-optionnels.ts).
CREATE TYPE "ModuleOptionnel" AS ENUM ('PAIE', 'REVISION', 'GESTION_COMMERCIALE', 'CONSOLIDATION', 'IFRS');

ALTER TABLE "tenants" ADD COLUMN "modulesActives" "ModuleOptionnel"[] NOT NULL DEFAULT ARRAY[]::"ModuleOptionnel"[];

-- Un dossier existant ne perd aucun menu qu'il utilise · seul un dossier
-- créé après cette migration part sans ces modules.
UPDATE "tenants" SET "modulesActives" = ARRAY['PAIE', 'REVISION', 'GESTION_COMMERCIALE', 'CONSOLIDATION', 'IFRS']::"ModuleOptionnel"[];
