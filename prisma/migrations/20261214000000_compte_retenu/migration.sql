-- Comptes retenus par le cabinet (schema.prisma, Compte.estRetenu). Les
-- dossiers existants gardent tout leur plan proposé · seul un dossier créé
-- après cette migration sème son plan non retenu.
ALTER TABLE "comptes" ADD COLUMN "estRetenu" BOOLEAN NOT NULL DEFAULT true;
