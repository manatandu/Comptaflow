-- TROIS DONNÉES QUE LE LOGICIEL NE POUVAIT PAS DEVINER, ET QUI LUI MANQUAIENT
-- POUR APPLIQUER TROIS RÈGLES QU'IL CONNAISSAIT DÉJÀ.
--
-- Chacune de ces trois colonnes ferme un écart où le module savait ce que le
-- texte commande, savait qu'il ne pouvait pas l'appliquer, et le disait en
-- avertissement faute de la donnée. C'est la donnée qui arrive ici, pas la
-- règle.
--
-- STRICTEMENT ADDITIVE · trois colonnes nullables ou à défaut, aucune
-- suppression, aucun renommage, aucune contrainte imposée à l'existant. Toute
-- ligne et tout tiers déjà en base restent valides sans reprise.
--
-- ------------------------------------------------------------------------
-- 1. tiers."celluleGroupeId" · LES OPÉRATIONS RÉCIPROQUES AU-DELÀ DU 58
-- ------------------------------------------------------------------------
-- Un groupe d'établissements est UNE SEULE personne morale tenue en plusieurs
-- dossiers. Une vente du siège à une antenne n'est donc pas une vente : c'est
-- un mouvement interne, que l'agrégat doit éliminer des deux côtés, produit
-- comme charge, créance comme dette.
--
-- L'agrégation ne neutralisait que les comptes 58 « Virements internes », donc
-- les seuls transferts de TRÉSORERIE. Tout le reste des opérations réciproques
-- restait dans l'agrégat, et rien ne pouvait le voir : un compte 411 ne dit pas
-- si son titulaire est un client ou une antenne. Le total du groupe comptait
-- alors un chiffre d'affaires que l'entité n'a jamais réalisé avec un tiers.
--
-- La contrainte de clé étrangère vise `tenants` sans pouvoir exiger « même
-- dossier mère » · une base de données ne sait pas exprimer cette condition.
-- C'est le service d'agrégation qui la vérifie, et qui refuse un rattachement
-- hors groupe.
--
-- ------------------------------------------------------------------------
-- 2. tiers."autoriseTvaDebits" · LA MENTION QUI SE LIT SUR LA FACTURE
-- ------------------------------------------------------------------------
-- L'art. 37, al. 1 de l'O.-L. n° 10/001 date le droit à déduction du client sur
-- l'exigibilité CHEZ LE FOURNISSEUR. Un fournisseur autorisé aux débits
-- (art. 26) rend sa taxe exigible à la facture et non au paiement : son client
-- peut donc déduire plus tôt.
--
-- Le décret n° 011/42, art. 60, impose que la mention « Autorisation
-- d'acquitter la TVA d'après les débits » figure « sur toutes les factures du
-- prestataire ou entrepreneur autorisé ». Elle se lit sur la facture, et nulle
-- part ailleurs : aucun calcul ne l'établit. Le module différait donc la
-- déduction des services au paiement pour tout le monde, en AVERTISSANT que
-- cette mention pouvait exister sans qu'il puisse la connaître.
--
-- FALSE PAR DÉFAUT, et c'est le droit commun · l'autorisation est
-- l'exception. Un tiers existant reste donc exactement dans l'état où le module
-- le traitait hier.
--
-- ------------------------------------------------------------------------
-- 3. lignes_ecriture."dateVersement" · LE MOIS QUI COMMANDE L'ÉCHÉANCE
-- ------------------------------------------------------------------------
-- Les textes rattachent la retenue au mois du VERSEMENT, jamais à celui de
-- l'écriture qui la constate : les retenues « doivent être versées au plus tard
-- le 15 du mois qui suit celui du VERSEMENT de ces revenus aux bénéficiaires ou
-- de LEUR MISE À DISPOSITION » (loi n° 004/2003, art. 18 ; même rattachement
-- aux art. 18 bis, 18 ter, 19 et 143).
--
-- Les deux dates coïncident quand la paie est comptabilisée le jour où elle est
-- payée, ce qui est fréquent. Elles divergent dès que la paie de décembre est
-- passée au 31 décembre et versée le 5 janvier : le registre datait alors
-- l'échéance de décembre, un mois trop tôt, et pouvait signaler un retard qui
-- n'existe pas.
--
-- NULL = la date de l'écriture fait foi, ce qui est le cas ordinaire et le
-- comportement d'aujourd'hui. Aucune ligne existante ne change de sens.

ALTER TABLE "tiers"
  ADD COLUMN "celluleGroupeId"             TEXT,
  ADD COLUMN "autoriseTvaDebits"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "referenceAutorisationDebits" TEXT;

ALTER TABLE "tiers"
  ADD CONSTRAINT "tiers_celluleGroupeId_fkey"
  FOREIGN KEY ("celluleGroupeId") REFERENCES "tenants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tiers_celluleGroupeId_idx" ON "tiers"("celluleGroupeId");

ALTER TABLE "lignes_ecriture"
  ADD COLUMN "dateVersement" TIMESTAMP(3);
