--
-- RECLASSEMENT D'UNE IMMOBILISATION · le changement d'utilisation que le
-- module ne savait pas faire.
--
-- AUDCIF, Titre VIII ch. 10 § 2.4 : « Les immeubles de placement peuvent faire
-- l'objet de changements d'utilisation, reflétés dans les états financiers par
-- des transferts entre catégories du bilan, par exemple vers les
-- immobilisations corporelles ou les stocks. » Et, décisif pour la mécanique :
-- « Étant donné que les immeubles de placement sont évalués selon le modèle du
-- coût historique, les transferts entre la catégorie "Immeubles de placement"
-- et les catégories "Biens immobiliers occupés par leur propriétaire" ou
-- "Stocks" N'ONT PAS D'INCIDENCE SUR LA VALEUR COMPTABLE du bien immobilier
-- transféré. »
--
-- CE QUE RIEN NE POUVAIT FAIRE. Les trois comptes d'une immobilisation étaient
-- figés à sa création et aucune route ne les modifiait. Deux issues, toutes
-- deux muettes :
--
--  · sans reclassement, un immeuble donné en location restait sur son compte
--    d'exploitation, et les notes qui isolent les immeubles de placement
--    affichaient zéro pour une entité qui en tire des loyers ;
--  · avec un reclassement passé à la main par une écriture diverse, le module
--    gardait l'ancien compte : sa SORTIE le créditait, laissant le nouveau
--    débiteur pour un bien vendu et l'ancien créditeur du même montant.
--    L'écriture s'équilibrait, la balance bouclait, le poste du bilan
--    totalisait juste · seule la ventilation des notes était fausse, et
--    durablement.
--
-- LES DEUX PLANS PORTENT LEURS COMPTES D'IMMEUBLES DE PLACEMENT, et
-- l'opération vaut donc des deux côtés : 2281, 2315, 2325 au SYSCOHADA comme
-- au SYCEBNL, qui y ajoute 2396 et 2445.
--
-- POURQUOI UNE TABLE, ET NON UN CHAMP ÉCRASÉ. Le motif du changement est une
-- information de notes annexes (§ 4.2 : « lorsque le classement est difficile,
-- l'indication des critères utilisés »), et un réviseur doit pouvoir voir
-- qu'un bien a changé de catégorie, quand, et pourquoi. Un compte remplacé en
-- place ne dirait rien.
--
-- PAS DE `tenantId` ICI, comme pour la dotation et la dépréciation : la ligne
-- est portée par son immobilisation, que le service n'atteint jamais autrement
-- que par un bien déjà borné au dossier.
CREATE TABLE "reclassements_immobilisation" (
    "id"                            TEXT         NOT NULL,
    "immobilisationId"              TEXT         NOT NULL,
    "exerciceId"                    TEXT         NOT NULL,
    "dateReclassement"              TIMESTAMP(3) NOT NULL,
    -- Obligatoire · le § 1.2 du chapitre qualifie un immeuble de placement par
    -- l'USAGE, que nul solde ne porte. Sans le motif écrit, le reclassement est
    -- un virement de comptes que personne ne peut justifier deux ans plus tard.
    "motif"                         TEXT         NOT NULL,
    -- Les comptes AVANT le virement · après lui, le bien porte les nouveaux.
    "ancienCompteImmobilisationId"  TEXT         NOT NULL,
    "nouveauCompteImmobilisationId" TEXT         NOT NULL,
    -- L'écriture de virement · valeur d'origine, cumul d'amortissement et
    -- dépréciation, tous VIRÉS sans être recalculés.
    "ecritureId"                    TEXT         NOT NULL,
    "createdAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"                     TEXT         NOT NULL,

    CONSTRAINT "reclassements_immobilisation_pkey" PRIMARY KEY ("id")
);

-- Une écriture ne peut porter qu'UN reclassement · c'est elle qui fait foi au
-- grand livre, et deux lignes qui la revendiqueraient rendraient l'historique
-- indécidable.
CREATE UNIQUE INDEX "reclassements_immobilisation_ecritureId_key"
    ON "reclassements_immobilisation"("ecritureId");

-- La lecture est toujours « les reclassements de CE bien », dans l'ordre.
CREATE INDEX "reclassements_immobilisation_immobilisationId_idx"
    ON "reclassements_immobilisation"("immobilisationId");

ALTER TABLE "reclassements_immobilisation"
    ADD CONSTRAINT "reclassements_immobilisation_immobilisationId_fkey"
    FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reclassements_immobilisation"
    ADD CONSTRAINT "reclassements_immobilisation_exerciceId_fkey"
    FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reclassements_immobilisation"
    ADD CONSTRAINT "reclassements_immobilisation_ancienCompteImmobilisationId_fkey"
    FOREIGN KEY ("ancienCompteImmobilisationId") REFERENCES "comptes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reclassements_immobilisation"
    ADD CONSTRAINT "reclassements_immobilisation_nouveauCompteImmobilisationId_fkey"
    FOREIGN KEY ("nouveauCompteImmobilisationId") REFERENCES "comptes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- RESTRICT et non SET NULL · une écriture de virement ne se supprime pas sans
-- que le reclassement qu'elle porte disparaisse avec elle. Le lien facultatif
-- que Prisma poserait en SET NULL laisserait un reclassement sans écriture,
-- c'est à dire un changement de catégorie que rien ne justifie au grand livre.
ALTER TABLE "reclassements_immobilisation"
    ADD CONSTRAINT "reclassements_immobilisation_ecritureId_fkey"
    FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
