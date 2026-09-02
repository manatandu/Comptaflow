-- AFFECTATION DU RÉSULTAT · ce que devient le résultat une fois l'exercice clos.
--
-- « L'affectation du résultat d'un exercice est décidée par les organes
-- compétents au cours de l'exercice suivant ; le compte 13 est donc SOLDÉ lors
-- de la comptabilisation de cette affectation » (AUDCIF, Titre VII, COMPTE 13).
-- Le SYCEBNL dit la même chose du sien : « Le compte 13 est donc soldé lors de
-- la comptabilisation de cette affectation. En fin d'exercice, le résultat net
-- de l'exercice précédent non affecté à un compte de réserves sera viré au
-- compte 12 - Report à nouveau. »
--
-- Sans ce module, le résultat restait sur 131 ou 139 et s'y empilait d'exercice
-- en exercice. Le total du passif restait juste · sa DÉCOMPOSITION était fausse,
-- et c'est elle que lit un bailleur, un banquier ou un auditeur.
--
-- Une seule affectation par exercice (contrainte d'unicité sur "exerciceId") :
-- l'organe compétent décide une fois, et une seconde décision est une
-- modification de la première, pas une seconde affectation.

CREATE TABLE "affectations_resultat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "dateDecision" TIMESTAMP(3) NOT NULL,
    "organe" TEXT NOT NULL,
    "reference" TEXT,
    "montant" DECIMAL(18,2) NOT NULL,
    "estBenefice" BOOLEAN NOT NULL,
    "ecritureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "affectations_resultat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lignes_affectation" (
    "id" TEXT NOT NULL,
    "affectationId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "libelle" TEXT,

    CONSTRAINT "lignes_affectation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "affectations_resultat_exerciceId_key" ON "affectations_resultat"("exerciceId");
CREATE UNIQUE INDEX "affectations_resultat_ecritureId_key" ON "affectations_resultat"("ecritureId");
CREATE INDEX "affectations_resultat_tenantId_idx" ON "affectations_resultat"("tenantId");
CREATE INDEX "lignes_affectation_affectationId_idx" ON "lignes_affectation"("affectationId");

ALTER TABLE "affectations_resultat" ADD CONSTRAINT "affectations_resultat_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affectations_resultat" ADD CONSTRAINT "affectations_resultat_exerciceId_fkey"
    FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "affectations_resultat" ADD CONSTRAINT "affectations_resultat_ecritureId_fkey"
    FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ON DELETE CASCADE sur les lignes : une affectation supprimée n'a aucune ligne
-- à laisser derrière elle. La suppression n'est possible que tant qu'aucune
-- écriture n'a été passée, le service s'en assure.
ALTER TABLE "lignes_affectation" ADD CONSTRAINT "lignes_affectation_affectationId_fkey"
    FOREIGN KEY ("affectationId") REFERENCES "affectations_resultat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lignes_affectation" ADD CONSTRAINT "lignes_affectation_compteId_fkey"
    FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
