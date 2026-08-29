# Trésorerie avancée (Moyens de Paiement) et BI / tableau de bord (Édition Pilotée)

Sources principales : documents #11, #17 (Moyens de Paiement Banque) et #9 (Édition
Pilotée).

## Module "Moyens de Paiement" (trésorerie avancée)

- Instruments de règlement distincts : **LCR** (Lettre de Change Relevée), **virement
  SEPA**, prélèvement · chacun avec un cycle propre : saisie → pointage → transmission
  → bordereau de remise imprimé.
- **Le règlement n'est finalisé qu'après édition du bordereau** (même règle que pour
  les règlements tiers en comptabilité générale · cohérence du modèle Sage sur ce
  point de contrôle).
- **Lots préétablis** de virements/prélèvements récurrents et répétitifs : paramétrés
  une fois, rappelés et ajustés à chaque échéance (modèle réutilisable pour une
  future gestion de charges récurrentes, type loyers).
- **Liaison comptable étroite** : le module paiement récupère automatiquement les
  échéances côté comptabilité, génère les écritures de règlement, ET déclenche le
  lettrage automatique correspondant. C'est un exemple concret d'intégration
  inter-module (paiement → comptabilité) à concevoir proprement, plutôt qu'un module
  isolé qui se contente d'exporter un fichier.
- Coordonnées bancaires structurées : RIB/IBAN/BIC, à la fois par banque de
  l'entreprise ET par tiers (pour les virements SEPA notamment).
- 3 canaux de connectivité bancaire, **spécifiques France/Europe, non transposables
  tels quels en zone OHADA** :
  - **ETEBAC** : transmission via modem, nécessite un contrat de transmission bancaire.
  - **LIBERTE** : envoi/réception via le portail web de la banque.
  - **EBICS** : protocole moderne sécurisé de télétransmission (via un outil dédié type
    "Sage direct").
  - À retenir seulement comme *pattern* général : un module de paiement qui
    exporte/importe des fichiers au format bancaire normalisé (équivalent local à
    définir selon les banques OHADA ciblées), pas comme un besoin fonctionnel
    identique.
- Gestion des extraits bancaires : réception (modem/messagerie/Internet), incorporation
  dans un rapprochement bancaire, analyse des soldes.

## Module "Édition Pilotée" (BI / tableau de bord avancé)

Couche de reporting séparée du transactionnel, au-dessus de Sage 100 Comptabilité,
Gestion Commerciale et Paie.

- **Catalogue d'états** organisé selon **3 modes d'accès** :
  - *Accès métier* : navigation par objectif métier → axe d'analyse → vue métier →
    état (ex. en comptabilité : "Activité et rentabilité" → "Analyse des risques et
    opportunités" → "Évolutions anormales des postes de charges" → état "Charges
    Détail").
  - *Accès direct* : navigation brute par entité (Comptabilité générale, Comptabilité
    analytique, Reporting, Trésorerie, Bilan et Compte de résultat...), pour les
    utilisateurs déjà familiers de l'application.
  - *Mes Favoris* : sélection personnalisée d'états, organisables par thématique
    personnalisable.
- **Tableau de bord** : vision synthétique de l'activité (chiffre d'affaires
  comptable, charges, analytique, trésorerie).
- **Vue Interactive** : historique sur 5 ans des indicateurs clés, lecture dynamique
  de leur contribution à la constitution du résultat.
- **Simulateur** : modélisation de scénarios (hypothèse de croissance du chiffre
  d'affaires, poids des charges) comparée au réalisé, avec **jauge de couleur**
  (vert/orange/rouge) indiquant la tendance ; permet d'enregistrer/charger/supprimer
  plusieurs simulations (par période, par hypothèse de croissance).
- Fonctionne sur un **cube de données** rafraîchi périodiquement (couche BI découplée
  du transactionnel, nécessite une "mise à jour des données" explicite avant
  consultation).

## Implication pour Compta Flow

- Le module Trésorerie est une **nouvelle brique**, pas explicitement prévue dans la
  vision initiale · à ajouter à la roadmap avec un séquencement clair : rapprochement
  bancaire manuel (brique courte) avant tout module de paiement avancé (lots, LCR,
  virements).
- Le pattern BI (catalogue à 3 modes d'accès, historique pluriannuel, simulateur) est
  intéressant pour une future version avancée du tableau de bord, mais très en aval :
  Postgres + requêtes vivantes suffira largement tant que le volume de reporting ne
  l'impose pas · la couche "cube de données" séparée n'est pas un besoin actuel.
