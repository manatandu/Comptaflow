---
name: sage-i7
description: "Analyse architecturale de Sage 100 Comptabilité i7 et de ses modules associés (Immobilisations, Moyens de Paiement/Banque, Paie & RH, Édition Pilotée) ainsi que de Sage ERP X3, issue de 19 documents de formation/manuels de référence fournis par l'utilisateur. Ne code AUCUN référentiel comptable (voir les skills `sycebnl`/`syscohada` pour ça) — encode des patterns d'architecture logicielle : structure du plan comptable (comptes Détail/Total, report à-nouveau à 3 modes), journaux (5 types, numérotation des pièces), lettrage/rapprochement bancaire, TVA (7 types de taxe), plan des tiers et modèles de règlement, immobilisations (familles, composants, amortissement dérogatoire, plans National/IFRS natifs), trésorerie avancée (LCR/SEPA/lots), BI/tableau de bord (catalogue d'états, simulateur), paie (moteur de constantes/barèmes, rubriques, passation comptable) et RBAC multi-couches (Sage X3). Sert de référence de conception pour Compta Flow, PAS de modèle à copier tel quel — chaque emprunt est explicitement filtré par ce qui est pertinent en contexte OHADA/SYCEBNL. Voir `docs/plan-de-construction.md` à la racine du dépôt pour la synthèse actionnable."
---

# Sage i7 — Analyse architecturale de référence pour Compta Flow

Ce skill n'encode **aucun texte légal ni référentiel comptable** — pour l'Acte
uniforme SYCEBNL ou le SYSCOHADA révisé, utiliser les skills `sycebnl`/`syscohada`.
Il encode uniquement des **patterns d'architecture logicielle** observés dans la
gamme Sage 100/i7 (le logiciel de comptabilité le plus utilisé dans l'écosystème
francophone OHADA), à des fins de conception pour Compta Flow.

**Règle d'usage** : chaque élément de ce skill est un point de comparaison, pas une
prescription. Un pattern Sage n'est retenu que s'il apporte une vraie valeur en
contexte OHADA/SYCEBNL — plusieurs éléments identifiés sont explicitement écartés ou
mis en réserve (voir `docs/plan-de-construction.md`). Ne jamais copier un mécanisme
Sage sans vérifier sa pertinence pour Compta Flow.

## Contenu

| Fichier | Contenu |
|---|---|
| `references/sources.md` | Inventaire des 19 documents sources, statut de lecture (intégrale/ciblée/catalogué/échec), et méthode d'extraction utilisée |
| `references/comptabilite-generale.md` | Plan comptable (comptes Détail/Total, report à-nouveau à 3 modes), journaux (5 types, numérotation), clôture (3 granularités), lettrage/rapprochement bancaire, TVA (7 types de taxe), automatisations (régularisation, abonnement, modèles de saisie, rappels/relevés, règlements en masse), comptabilité analytique, catalogue d'états |
| `references/tiers.md` | Plan des tiers (4 types, comptes rattachés/principal), modèle de règlement (échéancier), lettrage par tiers, rappels/relevés, règlements en masse |
| `references/immobilisations.md` | Familles d'immobilisations (gabarit), fiche immobilisation (nature d'acquisition/de bien, amortissement dégressif), gestion des composants, amortissement dérogatoire, plans National/IFRS natifs, sortie d'immobilisation |
| `references/tresorerie-et-bi.md` | Module Moyens de Paiement (LCR/SEPA/lots, liaison comptable, canaux bancaires) et module Édition Pilotée (catalogue d'états à 3 modes d'accès, tableau de bord, Vue Interactive, Simulateur) |
| `references/paie-et-x3.md` | Sage Paie/RH (fiche salarié, moteur de constantes/barèmes, rubriques, bulletins modèles, passation comptable) — hors périmètre SYCEBNL actuel ; Sage X3 (RBAC multi-couches) — hors périmètre structurel |

## Document de synthèse

**`docs/plan-de-construction.md`** (racine du dépôt Compta Flow) est le document
actionnable qui découle de ce skill : état des lieux, décisions d'architecture par
domaine, et feuille de route brique par brique. C'est ce document qu'il faut consulter
en premier pour orienter une décision de conception — ce skill n'en est que la matière
première détaillée.
