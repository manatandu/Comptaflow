-- AUDCIF Titre IX ch. 6, NOTE 36 · code activité principale (passe R3).
-- Nullable et sans défaut · aucun dossier existant ne l'a déclaré, et un code
-- posé d'office s'imprimerait sur la Fiche 1 de la liasse.
ALTER TABLE "tenants" ADD COLUMN "codeActivitePrincipale" TEXT;
