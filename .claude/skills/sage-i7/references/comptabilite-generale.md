# Comptabilité générale — modèle Sage 100/i7 (structure, journaux, lettrage, automatisations)

Sources principales : documents #1, #2, #5, #6, #8 (voir `sources.md`).

## Compte général (Plan comptable)

- Deux types structurels : **Détail** (saisie réelle) vs **Total** (agrégation par
  racine de numéro de compte — comptes, sections analytiques et rubriques de paie
  partagent tous ce même principe de regroupement par racine chez Sage).
- Longueur de compte paramétrable par dossier, 3 à 13 caractères, dont les 3 premiers
  obligatoirement numériques pour un compte Détail.
- **Report à-nouveau : 3 modes** par compte, pas 2 :
  - `Aucun` — pas de report (charges/produits, soldés sur le résultat).
  - `Solde` — seul le solde est reporté (comptes de bilan génériques).
  - `Détail` — tous les mouvements NON LETTRÉS sont reportés en détail (comptes clients/
    fournisseurs) ; nécessite un lettrage complet préalable à la clôture.
- **Compte reporting** : classification alternative pour états consolidés
  groupe/société mère (hors scope MVP, pertinent pour un futur module multi-entités).
- **Code taxe par défaut** sur le compte (charges/produits), auto-proposé en saisie.
- **Mise en sommeil** : désactivation réversible d'un compte sans suppression, distincte
  d'un simple flag booléen si l'on veut un historique d'activation.
- Un compte général peut être rattaché à un ou plusieurs comptes de tiers.

## Plan des tiers

Voir `tiers.md` pour le détail complet.

## Journaux comptables

- **5 types**, pas 4 : Achats / Ventes / Trésorerie / Général / **Situation** (jamais
  clôturé ni compacté — écritures provisoires/simulation).
- Le type du journal pilote le pré-positionnement automatique débit/crédit selon la
  nature du compte saisi (ergonomie de saisie, pas seulement une classification).
- **4 modes de numérotation des pièces** : Manuelle / Continue par journal / Continue
  pour le fichier / Mensuelle.
- Comportement de contrepartie configurable par journal : "Centraliser toutes les
  écritures" (une seule contrepartie globale) vs "Contrepartie à chaque ligne".
- Un journal peut être réservé aux écritures IFRS uniquement.
- Compte de trésorerie associé obligatoire pour un journal de type Trésorerie.

## Clôture — 3 granularités

- **Partielle** : écritures déjà validées verrouillées, mais nouvelles saisies encore
  possibles dans le journal ; lettrage et ventilation analytique encore permis.
- **Totale** : le journal est figé, plus aucune saisie possible.
- **Période** : verrouille jusqu'à une date donnée, tous journaux confondus.

## Lettrage et rapprochement

- **Lettrage manuel et automatique** (par montant) des écritures sur un compte (tiers
  ou général), avec gestion de lettre + **dé-lettrage**.
- **Pré-lettrage** : rapprochement provisoire avant lettrage définitif (confirmé par
  deux documents indépendants).
- **Rapprochement bancaire manuel** : pointage écriture par écriture face à un relevé
  bancaire, avec référence de pièce de trésorerie.
- **Rapprochement bancaire automatique** : réconciliation par tolérance de montant,
  génération d'une écriture d'ajustement si le solde lettré n'est pas exactement nul,
  extraits bancaires récupérés par import avant réconciliation.
- **Échéancier** : état de suivi des échéances à venir, distinct de la balance âgée.

## TVA / taxes

Entité "Taux de taxe" à part entière, avec **7 types possibles** :
TVA/Débit, TVA/Encaissement, TP/HT, TP/TTC, TP/Poids (taxes parafiscales), TVA/CEE
(échanges intracommunautaires), Surtaxe.

- Champs : code taxe, sens (déductible/collectée), intitulé, compte de taxe, taux,
  comptes généraux HT rattachés.
- Le régime Encaissement se déclenche à la date de règlement (pas la date de facture)
  — lien fort entre taxe et lettrage.
- "Registre taxe" : état intermédiaire de suivi base/montant par taux, ajustable.
- Le calcul de taxe ne peut se faire que dans un journal de type Achat ou Vente.

## Automatisations avancées

- **Écritures de régularisation** (charges/produits constatés d'avance) : identification
  de la période à cheval sur N/N+1, génération automatique de l'écriture de
  régularisation dans l'exercice courant + extourne dans l'exercice suivant.
- **Écritures d'abonnement** : génération périodique d'écritures répétitives (loyer,
  assurance) à partir d'un modèle de saisie dédié (le modèle doit ne demander que la
  date en saisie, tout le reste étant pré-rempli).
- **Modèles de saisie** : fonctions de zone (Saisir / Répéter / Incrémenter /
  Équilibrer / Calculer par paramétrage / Fonction pré-paramétrée) — généralise le
  système à 4 templates déjà en place côté Compta Flow (`SaisiePage`).
- **Rappels et relevés clients** : périodes de relance paramétrables, exclusion par
  tiers ("Hors rappel/relevé"), envoi par messagerie.
- **Règlement des tiers en masse** : génération d'ordres de paiement groupés,
  regroupement multi-factures par tiers ; le règlement n'est "effectif" qu'après
  impression de la lettre de règlement (point de contrôle à reprendre).

## Comptabilité analytique

- Jusqu'à 10-11 "plans analytiques" séparés (multi-axes, type centres de coûts/projets).
- Sections Détail vs Total (même logique de regroupement par racine que les comptes).
- "Niveau d'analyse" : classification transversale pour regroupement dans les états.
- Budget par axe général OU analytique, saisi par section/compte.
- Pour SYCEBNL (association/ONG/projet de développement), l'équivalent naturel serait
  un suivi analytique **par projet/bailleur**.

## Catalogue d'états à couvrir (référence pour la future brique "États financiers avancés")

Grand livre, balance, balance âgée (échéances futures), journal centralisé, états
tiers (balance/grand livre/statistique), états analytiques, comparatif multi-exercice,
analyse des journaux, palmarès des comptes, tableau de bord personnalisé, contrôle de
caisse, états libres personnalisables.
