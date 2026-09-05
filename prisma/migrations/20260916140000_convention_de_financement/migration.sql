--
-- CONVENTION DE FINANCEMENT · le dossier de subvention que rien ne détenait.
--
-- `bailleurs` ne portait que six colonnes : code, nom, actif, et ses
-- rattachements. Ni montant accordé, ni tranches, ni conditions, ni rapports
-- dus, ni dates de validité. Deux conséquences, chacune dans son texte.
--
-- LA PREMIÈRE EST COMPTABLE. SYCEBNL, cadre conceptuel § 5.4.2.4 : « Un
-- engagement de financement est comptabilisé dans les créances à recevoir de
-- l'entité bénéficiaire s'il correspond à un engagement FERME ET
-- INCONDITIONNEL et a fait l'objet d'un ÉCRIT SIGNÉ par les représentants
-- habilités des tiers financeurs. Un engagement CONDITIONNEL doit faire
-- l'objet d'une mention dans les Notes annexes et ne sera comptabilisé que
-- lorsque les conditions sont remplies. »
--
-- Ces deux caractères commandent le TRAITEMENT : une créance au bilan d'un
-- côté, une simple mention en notes de l'autre. Rien ne les enregistrait, et
-- les deux erreurs qui en découlent sont MUETTES · une promesse conditionnelle
-- portée en créance gonfle l'actif d'une somme qui pourrait ne jamais venir,
-- un engagement ferme laissé hors bilan le sous-évalue, et dans les deux cas
-- l'écriture s'équilibre et la balance boucle.
--
-- LE LOGICIEL NE QUALIFIE PAS, IL SE SOUVIENT. C'est le cabinet qui lit la
-- convention et décide. Aucune colonne ici ne se déduit d'un montant ni d'un
-- nom de bailleur · le logiciel exige seulement que la décision soit écrite,
-- et il en tire la mention de notes que le texte réclame.
--
-- LA SECONDE EST ADMINISTRATIVE. Le jalon 11 du planning de clôture demande de
-- vérifier « à chaque exercice que l'accord-cadre est en cours de validité »
-- (loi n° 004/2001 du 20 juillet 2001, art. 37). Il le demandait sur une
-- donnée que rien ne détenait.
CREATE TYPE "CaractereEngagement" AS ENUM ('FERME_INCONDITIONNEL', 'CONDITIONNEL');
CREATE TYPE "StatutConvention" AS ENUM ('EN_COURS', 'CLOTUREE', 'RESILIEE');
CREATE TYPE "NatureRapportBailleur" AS ENUM ('FINANCIER', 'NARRATIF', 'AUDIT');

CREATE TABLE "conventions_financement" (
    "id"             TEXT                  NOT NULL,
    "tenantId"       TEXT                  NOT NULL,
    "bailleurId"     TEXT                  NOT NULL,
    "reference"      TEXT                  NOT NULL,
    "objet"          TEXT                  NOT NULL,
    -- L'ÉCRIT SIGNÉ du § 5.4.2.4 · sans lui, aucun engagement ne peut être
    -- porté en créance, si ferme soit-il. Le signataire est nommé parce que le
    -- texte dit « les représentants HABILITÉS des tiers financeurs » : un
    -- écrit signé par quelqu'un d'autre n'engage pas le financeur.
    "ecritSigne"     BOOLEAN               NOT NULL DEFAULT false,
    "signataire"     TEXT,
    "dateSignature"  TIMESTAMP(3),
    -- Validité · ce que le jalon 11 demande de vérifier.
    "dateDebut"      TIMESTAMP(3)          NOT NULL,
    "dateFin"        TIMESTAMP(3)          NOT NULL,
    "montantAccorde" DECIMAL(18,2)         NOT NULL,
    "caractere"      "CaractereEngagement" NOT NULL,
    -- Obligatoire quand l'engagement est CONDITIONNEL · ce sont ces conditions
    -- que les Notes annexes doivent mentionner, et « conditionnel sans dire à
    -- quoi » ne se mentionne pas.
    "conditions"     TEXT,
    "statut"         "StatutConvention"    NOT NULL DEFAULT 'EN_COURS',
    "motifCloture"   TEXT,
    "createdAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"      TEXT                  NOT NULL,
    "updatedAt"      TIMESTAMP(3)          NOT NULL,

    CONSTRAINT "conventions_financement_pkey" PRIMARY KEY ("id")
);

-- Une même référence ne se saisit qu'une fois par bailleur · deux exemplaires
-- de la même convention doubleraient le montant accordé et donc la créance à
-- recevoir, sans qu'aucun total ne bouge par ailleurs.
CREATE UNIQUE INDEX "conventions_financement_tenantId_bailleurId_reference_key"
    ON "conventions_financement"("tenantId", "bailleurId", "reference");

CREATE INDEX "conventions_financement_tenantId_idx" ON "conventions_financement"("tenantId");

ALTER TABLE "conventions_financement"
    ADD CONSTRAINT "conventions_financement_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conventions_financement"
    ADD CONSTRAINT "conventions_financement_bailleurId_fkey"
    FOREIGN KEY ("bailleurId") REFERENCES "bailleurs"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une tranche promise par la convention · la colonne « Echéances » que la
-- NOTE 10 « Subventions » réclame en regard de chaque subvention.
--
-- L'encaissement est SAISI et non déduit d'un solde : le compte du bailleur
-- reçoit aussi des remboursements et des régularisations, et lire la tranche
-- dans un solde ferait dire à un virement ce qu'il ne dit pas.
CREATE TABLE "tranches_financement" (
    "id"               TEXT          NOT NULL,
    "conventionId"     TEXT          NOT NULL,
    "numero"           INTEGER       NOT NULL,
    "libelle"          TEXT          NOT NULL,
    "montant"          DECIMAL(18,2) NOT NULL,
    "datePrevue"       TIMESTAMP(3)  NOT NULL,
    "dateEncaissement" TIMESTAMP(3),
    "montantEncaisse"  DECIMAL(18,2),
    "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tranches_financement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tranches_financement_conventionId_numero_key"
    ON "tranches_financement"("conventionId", "numero");

-- CASCADE · une tranche n'a aucun sens sans sa convention.
ALTER TABLE "tranches_financement"
    ADD CONSTRAINT "tranches_financement_conventionId_fkey"
    FOREIGN KEY ("conventionId") REFERENCES "conventions_financement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Les rapports dus au bailleur. Ils ne sont pas comptables, et c'est pourquoi
-- rien ne les portait · mais c'est leur retard, et non un solde, qui suspend
-- le versement de la tranche suivante dans la plupart des conventions.
CREATE TABLE "rapports_bailleur" (
    "id"               TEXT                    NOT NULL,
    "conventionId"     TEXT                    NOT NULL,
    "intitule"         TEXT                    NOT NULL,
    "nature"           "NatureRapportBailleur" NOT NULL,
    "dateEcheance"     TIMESTAMP(3)            NOT NULL,
    "dateTransmission" TIMESTAMP(3),
    "observation"      TEXT,
    "createdAt"        TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rapports_bailleur_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rapports_bailleur_conventionId_idx" ON "rapports_bailleur"("conventionId");

ALTER TABLE "rapports_bailleur"
    ADD CONSTRAINT "rapports_bailleur_conventionId_fkey"
    FOREIGN KEY ("conventionId") REFERENCES "conventions_financement"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
