-- DÉPRÉCIATION DES IMMOBILISATIONS DANS LE MODULE.
--
-- Les comptes 29 étaient déjà semés et mouvementables à la main. Ce que le
-- module ignorait, ce sont les deux conséquences de la dépréciation sur la vie
-- du bien, et c'est là que le dossier divergeait en silence :
--
--  1. la base amortissable · AUDCIF Titre VIII ch. 12 § 2.4.1, « après la
--     comptabilisation d'une perte de valeur, le plan d'amortissement de
--     l'actif doit être ajusté pour les exercices suivants, afin que la valeur
--     comptable révisée, diminuée de sa valeur résiduelle, puisse être répartie
--     de façon systématique sur sa durée d'utilité restant à courir » ;
--  2. la sortie · le compte 29 ne se soldait pas, ce qui surévaluait la valeur
--     comptable nette portée au 81 et faussait la plus ou moins-value.
--
-- SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 29 : mêmes principes, mêmes indices
-- externes et internes, et « les dépréciations sont inscrites distinctement à
-- l'actif, en diminution de la valeur brute des biens correspondants ».
--
-- UNE SEULE LIGNE PAR BIEN ET PAR EXERCICE · le test se fait à la clôture, et
-- deux tests contradictoires sur le même exercice n'auraient pas de sens.
-- L'unicité sert aussi de verrou contre deux enregistrements concurrents, comme
-- pour la dotation aux amortissements.
CREATE TYPE "SensDepreciation" AS ENUM ('DOTATION', 'REPRISE');

CREATE TABLE "depreciations_immobilisation" (
  "id"                   TEXT NOT NULL,
  "immobilisationId"     TEXT NOT NULL,
  "exerciceId"           TEXT NOT NULL,
  "sens"                 "SensDepreciation" NOT NULL,
  -- Toujours POSITIF · le sens porte la direction. Un montant signé se lirait
  -- à l'envers une fois sur deux dans un état.
  "montant"              DECIMAL(18,2) NOT NULL,
  "compteDepreciationId" TEXT NOT NULL,
  "compteContrepartieId" TEXT NOT NULL,
  -- L'indice de perte de valeur qui justifie le test. Sans indice, aucun test
  -- n'est requis (ch. 12 § 2.1) et donc aucune dotation n'est justifiable :
  -- c'est cette ligne qui rend la dépréciation opposable à un réviseur.
  "indice"               TEXT NOT NULL,
  "ecritureId"           TEXT NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"            TEXT NOT NULL,

  CONSTRAINT "depreciations_immobilisation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "depreciations_immobilisation_ecritureId_key"
  ON "depreciations_immobilisation"("ecritureId");
CREATE UNIQUE INDEX "depreciations_immobilisation_immobilisationId_exerciceId_key"
  ON "depreciations_immobilisation"("immobilisationId", "exerciceId");
CREATE INDEX "depreciations_immobilisation_exerciceId_idx"
  ON "depreciations_immobilisation"("exerciceId");

ALTER TABLE "depreciations_immobilisation"
  ADD CONSTRAINT "depreciations_immobilisation_immobilisationId_fkey"
  FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "depreciations_immobilisation"
  ADD CONSTRAINT "depreciations_immobilisation_exerciceId_fkey"
  FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "depreciations_immobilisation"
  ADD CONSTRAINT "depreciations_immobilisation_compteDepreciationId_fkey"
  FOREIGN KEY ("compteDepreciationId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "depreciations_immobilisation"
  ADD CONSTRAINT "depreciations_immobilisation_compteContrepartieId_fkey"
  FOREIGN KEY ("compteContrepartieId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "depreciations_immobilisation"
  ADD CONSTRAINT "depreciations_immobilisation_ecritureId_fkey"
  FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
