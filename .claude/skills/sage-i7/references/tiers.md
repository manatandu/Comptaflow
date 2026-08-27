# Plan des tiers (comptabilité auxiliaire) — modèle Sage 100/i7

Sources principales : documents #1, #2, #6, #8, #17.

## Types et structure

- 4 types de compte tiers : **Client / Fournisseur / Salarié / Autre**.
- Un tiers a un ou plusieurs **comptes généraux rattachés**, dont un marqué
  **Principal** (premier sélectionné par défaut, un seul principal à la fois) — c'est
  le vrai modèle "sous-compte auxiliaire remonté sur un compte collectif" : en saisie,
  indiquer le tiers propose automatiquement son compte général principal.
- Champs d'identification : numéro (jusqu'à 17 caractères alphanumériques, unique tous
  types confondus), intitulé (35 car.), classement/abrégé (17 car., recherche/tri),
  qualité, contact, adresse complète, téléphone/télécopie/e-mail/site, devise,
  raccourci (6 car. max, pour appel rapide en saisie).
- **Compte collectif** : proposé par défaut selon le type de tiers (ex. 4411 pour un
  fournisseur, 3421 pour un client).

## Modèle de règlement (conditions de paiement)

Réutilisable au-delà des tiers (paie, trésorerie) :

- Type : pourcentage / équilibre (le solde) / montant.
- Nombre de jours de délai entre la date de la pièce génératrice (facture) et la date
  du premier versement.
- Condition de calcul de la date d'échéance : jour net (à partir de la date d'écriture)
  / fin de mois civil / fin de mois (après application du délai) / jour de tombée fixe.
- Un tiers peut avoir plusieurs échéances (règlement multi-échéance).

## Options de comportement par tiers

- Lettrage automatique configurable.
- "Hors rappel/relevé" : exclusion des relances (client) ou des relevés (fournisseur).
- "Non soumis à pénalités de retard".
- "Mise en sommeil" (désactivation réversible, confirmation requise en saisie).
- "Validation automatique des règlements" (masque la fenêtre d'échéances si coché).
- "Tiers payeur" : numéro du tiers réellement payeur/encaisseur si différent.

## Lettrage et rapprochement (voir aussi `comptabilite-generale.md`)

- Lettrage manuel (sélection débit/crédit, solde lettré doit être nul) et automatique
  par montant.
- Dé-lettrage (annulation), en saisissant la lettre à annuler.
- Pré-lettrage (rapprochement provisoire avant lettrage définitif).
- Interrogation du compte tiers : historique complet, impression de l'extrait de
  compte (seules les écritures non lettrées apparaissent sur le "justificatif du
  solde").

## Rappels et relevés

- Périodes de rappel paramétrables (intitulé significatif, ex. nombre de jours).
- Sélection/impression par fourchette de critères, envoi possible par messagerie.
- Actions disponibles : exclure du circuit, décaler l'échéance, mettre à jour le
  nombre de relances.

## Règlement des tiers en masse

- Édition des ordres de paiement + enregistrement automatique des règlements en
  comptabilité.
- Regroupement possible de plusieurs factures d'un même tiers sur un même règlement.
- Règlement partiel possible.
- **Le règlement n'est effectif qu'après impression de la lettre de règlement** — état
  intermédiaire "en attente d'impression" à prévoir comme état légitime.

## Implication pour Compta Flow

Cette brique dépend directement du lettrage (voir `comptabilite-generale.md`) — ne pas
l'attaquer avant que le lettrage existe, sous peine de devoir la refaire.
