-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "assujettissementTvaRepondu" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "venteBiensServices" BOOLEAN;


-- Un dossier déjà coché assujetti a répondu · le faux par défaut, lui, reste
-- « pas encore dit » (voir le commentaire du schéma).
UPDATE "tenants" SET "assujettissementTvaRepondu" = true WHERE "assujettiTva" = true;
