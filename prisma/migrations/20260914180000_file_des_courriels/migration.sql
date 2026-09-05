-- LA FILE DES COURRIELS · OmegaX n'envoie aujourd'hui AUCUN courriel.
--
-- Le module de relances compose déjà des lettres de rappel complètes
-- (RelancesService.emettre), et la sécurité produit des mots de passe
-- temporaires : personne ne les reçoit. Rien dans le produit ne sait parler à
-- un serveur de messagerie, et rien ne le dit à l'utilisateur, qui croit
-- raisonnablement qu'une lettre émise est une lettre partie.
--
-- STRICTEMENT ADDITIVE · une table neuve et une énumération neuve. Aucune
-- table existante n'est touchée, aucune colonne ajoutée ailleurs, aucune
-- contrainte imposée à l'existant.
--
-- ------------------------------------------------------------------------
-- POURQUOI UNE FILE, ET NON UN APPEL DIRECT
-- ------------------------------------------------------------------------
-- Un envoi tenté sans avoir été écrit d'abord est perdu quand il échoue. Or la
-- relance a été DÉCIDÉE par le comptable : elle doit survivre à une coupure
-- réseau, à un redémarrage de l'instance, et surtout se VOIR. D'où une ligne en
-- base avant toute tentative, et un état qui dit où en est chaque message.
--
-- ------------------------------------------------------------------------
-- SANS_TRANSPORT N'EST PAS UN ÉCHEC, ET C'EST L'ÉTAT QUI COMPTE AUJOURD'HUI
-- ------------------------------------------------------------------------
-- Aucun transport n'est configuré sur cette installation. Le logiciel a donc
-- trois conduites possibles, et deux sont fautives : prétendre avoir envoyé
-- (un mensonge que rien ne rattrape), ou refuser l'action (le comptable perd
-- son travail). La troisième est celle-ci · il ÉCRIT le message, le marque
-- pour ce qu'il est, et le dit à l'écran. Le jour où les identifiants seront
-- posés, ces messages repartent sans avoir été réécrits.
--
-- ABANDONNE est terminal, et reste LISIBLE avec sa dernière erreur : une
-- relance qui n'est jamais partie est une information comptable, pas un déchet
-- technique. Un dossier de recouvrement se défend avec ce qu'on a tenté.
--
-- ------------------------------------------------------------------------
-- AUCUN SECRET DANS CETTE TABLE, ET C'EST DÉLIBÉRÉ
-- ------------------------------------------------------------------------
-- Le serveur, le port, l'identifiant et le mot de passe du compte d'envoi
-- vivent dans l'ENVIRONNEMENT (variables SMTP_*), comme DATABASE_URL, jamais
-- dans cette table ni dans le dépôt. Une base de données se sauvegarde,
-- s'exporte, se restaure sur un poste de test et se lit : un mot de passe de
-- boîte aux lettres n'y a pas sa place, et une sauvegarde quotidienne le
-- recopierait chaque nuit.
--
-- Conséquence pratique, et elle est voulue : il n'y a RIEN à configurer dans
-- une fenêtre du logiciel. Poser le courriel se fait en posant des secrets sur
-- le service, pas en remplissant un formulaire qu'un utilisateur pourrait lire.

CREATE TYPE "StatutMessage" AS ENUM (
  'EN_ATTENTE',
  'SANS_TRANSPORT',
  'ENVOYE',
  'ECHEC',
  'ABANDONNE'
);

CREATE TABLE "messages" (
  "id"              TEXT            NOT NULL,
  "tenantId"        TEXT            NOT NULL,
  "destinataire"    TEXT            NOT NULL,
  "destinataireNom" TEXT,
  "sujet"           TEXT            NOT NULL,
  "corps"           TEXT            NOT NULL,
  "origine"         TEXT            NOT NULL,
  "origineId"       TEXT,
  "statut"          "StatutMessage" NOT NULL DEFAULT 'EN_ATTENTE',
  "tentatives"      INTEGER         NOT NULL DEFAULT 0,
  "dernierEssaiAt"  TIMESTAMP(3),
  "prochainEssaiAt" TIMESTAMP(3),
  "erreur"          TEXT,
  "envoyeAt"        TIMESTAMP(3),
  "createdBy"       TEXT,
  "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- La file ne se lit que de deux façons · par dossier et par état, pour l'écran
-- de suivi et pour la reprise des échecs.
CREATE INDEX "messages_tenantId_statut_idx" ON "messages"("tenantId", "statut");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
