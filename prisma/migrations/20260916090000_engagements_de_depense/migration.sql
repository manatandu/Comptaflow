--
-- ENGAGEMENTS DE DÉPENSE · les deux tiers de la colonne Engagement que le
-- tableau d'exécution budgétaire déclarait lui-même ne pas porter.
--
-- SYCEBNL, Guide d'application, chapitre 7, APPLICATION 22, règle de
-- remplissage (d) : « Engagement pour chaque item :
--   · solde créditeur balance N des comptes fournisseurs d'exploitation
--     (compte 40) et d'investissement (compte 481) ;
--   · bons de commande de biens et services remis aux fournisseurs au cours de
--     l'exercice budgétaire, non exécutés ;
--   · contrats signés par les parties prenantes au cours de l'exercice
--     budgétaire, non exécutés. »
--
-- Le premier terme est comptable et le service le porte depuis l'origine. Les
-- deux autres NE SONT PAS DES ÉCRITURES : un bon de commande remis ne débite ni
-- ne crédite rien, et c'est précisément pour cela qu'il engage le budget sans
-- apparaître dans les comptes. Ils vivent donc dans un registre propre.
--
-- CE QUI SE PASSAIT SANS CETTE TABLE. Le tableau rendait une phrase disant à
-- l'utilisateur d'ajouter ces deux termes À LA MAIN sur l'état imprimé. C'était
-- honnête, et c'était le bon parti tant que rien ne les tenait · mais un
-- tableau d'exécution budgétaire est exactement le document qu'un bailleur
-- lit, et le crédit disponible qu'il y trouvait était SURÉVALUÉ de tout ce qui
-- était commandé sans être encore facturé.
--
-- LE DANGER EST LE DOUBLE COMPTE, et il casse en silence (CLAUDE.md § 10 bis).
-- Quand la facture arrive, la dépense entre au 40 et rejoint le premier terme.
-- Si le bon de commande restait entier dans le deuxième, la même dépense
-- serait comptée deux fois : le tableau bouclerait toujours, puisque
-- Réalisation = (2) + (3) par construction, et seul le crédit disponible
-- serait faux, cette fois en moins. Aucun contrôle d'équilibre ne peut voir
-- cela.
--
-- D'où le parti retenu : l'exécution n'est pas une case à cocher mais un
-- RATTACHEMENT à l'écriture qui exécute l'engagement. Ce qui entre dans la
-- colonne est le RESTE À EXÉCUTER, et ce reste se réduit de lui-même à mesure
-- que les écritures arrivent. Une case à cocher aurait reposé sur la mémoire
-- de celui qui saisit ; le rattachement repose sur une écriture qui existe.
CREATE TYPE "NatureEngagement" AS ENUM ('BON_DE_COMMANDE', 'CONTRAT');

-- Deux états seulement. CLOS est la sortie MANUELLE, motivée : une commande
-- annulée cesse de peser sur le budget sans qu'aucune écriture ne vienne
-- jamais l'exécuter. Il n'y a pas d'état « exécuté » : l'exécution est un
-- MONTANT, pas un état, et un engagement exécuté à 100 % pèse zéro de
-- lui-même.
CREATE TYPE "StatutEngagement" AS ENUM ('OUVERT', 'CLOS');

CREATE TABLE "engagements_depense" (
    "id"           TEXT               NOT NULL,
    "tenantId"     TEXT               NOT NULL,
    -- « au cours de l'exercice budgétaire » · l'engagement appartient à un
    -- exercice, et le tableau d'un exercice ne voit que les siens.
    "exerciceId"   TEXT               NOT NULL,
    -- La ligne budgétaire engagée. Le tableau se remplit « suivant la
    -- nomenclature budgétaire du projet », qui est un plan analytique dans
    -- OmegaX : un engagement sans section ne saurait pas sur quelle ligne
    -- peser, et le total du tableau ne bougerait pas.
    "sectionId"    TEXT               NOT NULL,
    -- Les deux natures que le guide énumère, et pas une de plus · inventer une
    -- troisième catégorie ferait entrer dans la colonne quelque chose que le
    -- texte n'y met pas (CLAUDE.md § 1).
    "nature"       "NatureEngagement" NOT NULL,
    "reference"    TEXT               NOT NULL,
    "objet"        TEXT               NOT NULL,
    "beneficiaire" TEXT               NOT NULL,
    -- Remise du bon au fournisseur, ou signature du contrat.
    "date"         TIMESTAMP(3)       NOT NULL,
    "montant"      DECIMAL(18,2)      NOT NULL,
    "statut"       "StatutEngagement" NOT NULL DEFAULT 'OUVERT',
    -- Exigé à la clôture manuelle : un engagement qui disparaît du tableau
    -- sans motif est une correction sans trace.
    "motifCloture" TEXT,
    "createdAt"    TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"    TEXT               NOT NULL,
    "updatedAt"    TIMESTAMP(3)       NOT NULL,

    CONSTRAINT "engagements_depense_pkey" PRIMARY KEY ("id")
);

-- Un même bon de commande ne se saisit qu'une fois dans un exercice. Sans
-- cette contrainte, une double saisie doublerait silencieusement le poids de
-- la commande sur le budget · exactement le défaut que cette table existe pour
-- fermer.
CREATE UNIQUE INDEX "engagements_depense_tenantId_exerciceId_nature_reference_key"
    ON "engagements_depense"("tenantId", "exerciceId", "nature", "reference");

-- La lecture est toujours « les engagements de CE dossier sur CET exercice ».
CREATE INDEX "engagements_depense_tenantId_exerciceId_idx"
    ON "engagements_depense"("tenantId", "exerciceId");

ALTER TABLE "engagements_depense"
    ADD CONSTRAINT "engagements_depense_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "engagements_depense"
    ADD CONSTRAINT "engagements_depense_exerciceId_fkey"
    FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "engagements_depense"
    ADD CONSTRAINT "engagements_depense_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "sections_analytiques"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Le rattachement d'une écriture à l'engagement qu'elle exécute.
--
-- Le montant est SAISI et non déduit de l'écriture : une facture peut solder
-- deux bons de commande à la fois, et une commande peut être livrée en deux
-- fois. Le déduire du total de l'écriture serait juste dans le cas simple et
-- faux dans les deux autres.
--
-- PAS DE `tenantId` ICI : la ligne est portée par son engagement, que le
-- service n'atteint jamais autrement qu'après l'avoir borné au dossier.
CREATE TABLE "executions_engagement" (
    "id"           TEXT          NOT NULL,
    "engagementId" TEXT          NOT NULL,
    "ecritureId"   TEXT          NOT NULL,
    "montant"      DECIMAL(18,2) NOT NULL,
    "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"    TEXT          NOT NULL,

    CONSTRAINT "executions_engagement_pkey" PRIMARY KEY ("id")
);

-- Une même écriture ne s'impute qu'une fois sur un engagement donné · deux
-- rattachements de la même facture au même bon annuleraient deux fois le même
-- reste à exécuter, et l'engagement cesserait de peser alors qu'il pèse encore.
CREATE UNIQUE INDEX "executions_engagement_engagementId_ecritureId_key"
    ON "executions_engagement"("engagementId", "ecritureId");

-- Lecture inverse : « cette écriture exécute-t-elle un engagement ? », posée
-- avant toute suppression d'écriture.
CREATE INDEX "executions_engagement_ecritureId_idx"
    ON "executions_engagement"("ecritureId");

-- CASCADE ici, et lui seul de tout ce fichier : l'exécution n'a aucun sens
-- sans son engagement, et supprimer l'engagement doit emporter ses
-- rattachements plutôt que de les laisser orphelins.
ALTER TABLE "executions_engagement"
    ADD CONSTRAINT "executions_engagement_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "engagements_depense"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT et non SET NULL · une écriture qui exécute un engagement ne se
-- supprime pas en dénouant le lien en silence. Le reste à exécuter remonterait
-- sans que personne ne l'ait décidé, et la colonne Engagement grossirait toute
-- seule.
ALTER TABLE "executions_engagement"
    ADD CONSTRAINT "executions_engagement_ecritureId_fkey"
    FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
