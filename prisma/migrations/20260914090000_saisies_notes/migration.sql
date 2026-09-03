-- SAISIE DES RUBRIQUES DE NOTES RENSEIGNÉES HORS COMPTABILITÉ.
--
-- 322 rubriques des trois jeux de notes portent `saisie: true` : engagements,
-- effectifs, informations sociales et environnementales, événements
-- postérieurs à la clôture. Elles sont obligatoires (SYCEBNL art. 15, AUDCIF
-- art. 33) et aucune balance ne les porte · faute de table elles sortaient
-- vides de la liasse, remplissables seulement dans le classeur exporté.
CREATE TABLE "saisies_notes" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "exerciceId"   TEXT NOT NULL,
  "jeu"          "JeuNotesAnnexes" NOT NULL,
  "codeNote"     TEXT NOT NULL,
  "cleRubrique"  TEXT NOT NULL,
  "colonne"      INTEGER NOT NULL,
  "valeurTexte"  TEXT,
  "valeurNombre" DECIMAL(20,2),
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "updatedBy"    TEXT NOT NULL,

  CONSTRAINT "saisies_notes_pkey" PRIMARY KEY ("id")
);

-- Une cellule et une seule par (dossier, exercice, jeu, note, rubrique,
-- colonne) · c'est cette contrainte qui rend l'enregistrement idempotent
-- (upsert) plutôt qu'empilable.
CREATE UNIQUE INDEX "saisies_notes_tenantId_exerciceId_jeu_codeNote_cleRubrique__key"
  ON "saisies_notes"("tenantId", "exerciceId", "jeu", "codeNote", "cleRubrique", "colonne");

-- Le moteur de notes lit TOUTES les saisies d'un exercice en une fois.
CREATE INDEX "saisies_notes_tenantId_exerciceId_jeu_idx"
  ON "saisies_notes"("tenantId", "exerciceId", "jeu");

ALTER TABLE "saisies_notes" ADD CONSTRAINT "saisies_notes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saisies_notes" ADD CONSTRAINT "saisies_notes_exerciceId_fkey"
  FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
