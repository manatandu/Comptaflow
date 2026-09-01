# États financiers et liasses — spécification par référentiel et par système

Cahier des charges du module « états financiers » de Compta Flow, aligné sur
les moteurs de liasse construits et validés dans le dépôt Skill-Claude
(`.claude/skills/syscohada/liasse/` et `.claude/skills/sycebnl/liasse/`,
branche `claude/ohada-sycebnl-financial-statements-xz5gd9`). Ces moteurs
Python/openpyxl font office d'implémentation de référence : correspondances
compte → poste vérifiées contre les textes officiels, corrections
documentées ligne à ligne, sorties Excel testées (contrôles d'équilibre
recalculés à zéro sur balances synthétiques).

## Règle de flux (identique dans l'application)

Devant une balance, deux questions avant toute génération :

1. **Référentiel** : SYSCOHADA (entité commerciale) ou SYCEBNL (EBNL).
   Dans Compta Flow, cette information vient du paramétrage du dossier
   (division SYCEBNL/SYSCOHADA déjà en place) — ne jamais l'inférer de la
   seule numérotation des comptes.
2. **Système** :
   - SYSCOHADA → Système normal ou Système minimal de trésorerie (seuils
     AUDCIF art. 13 : CA HT ≤ 60 M FCFA négoce, 40 M artisanat, 30 M
     services) ;
   - SYCEBNL → associations/ordres professionnels (Système normal),
     projets de développement et assimilés, ou SMT (ressources ≤ 30 M
     FCFA, Acte uniforme art. 5-6).

Chaque système a **son propre jeu d'états et ses propres notes annexes** ;
aucun partage de maquette entre systèmes.

## Les cinq jeux d'états

| Référentiel / système | États | Notes annexes | Source officielle |
|---|---|---|---|
| SYSCOHADA — Système normal | Bilan (actif / passif), Compte de résultat, TFT | Notes 1 à 36 (3A-3F, 8A/8B, 15A/B, 16A-16C, 27A/B…) | AUDCIF Titre IX ch. 6-7 |
| SYSCOHADA — SMT | Bilan SMT, Compte de résultat SMT (G = C − D + E − F) | Notes 1 à 4 + journaux de suivi | AUDCIF Titre X ch. 1-3 |
| SYCEBNL — associations (SN) | Bilan (AA→DZ), Compte de résultat (RA→XE), TFT (ZA→ZG, méthode directe) | Notes 1 à 35 (5A-5H, 17A/B, 18A/B, 29A/B) | JO OHADA 22/02/2023, Partie 4 ch. 2 |
| SYCEBNL — projets de développement | Tableau emplois-ressources (FA→GZ), Tableau d'exécution budgétaire, Tableau de réconciliation de trésorerie (A→I), Bilan (en net), Compte d'exploitation (RA→XC) | Notes 1 à 24 (3A/3B, 20A/B) | Partie 4 ch. 3 |
| SYCEBNL — SMT | Bilan (GA→HZ), Compte de résultat (KA→KZC) | Notes 1 à 5 | Partie 4 ch. 4 |

## Décisions de correspondance à reprendre telles quelles

Les maquettes TSV des skills (colonne `note`) documentent chaque écart au
texte officiel. À reprendre dans Compta Flow :

**SYSCOHADA SN** : AL sans 2394/2395/2398 ; BS sans 585/588 (résidu de
virement interne = anomalie) ; CJ (résultat bilan) = résultat du CR + solde
classe 13, pour boucler avant comme après affectation ; TFT — les cellules
FB/FC/FD portent l'opposé de la variation (libellés « − Variation … », ZB
somme simple).

**SYCEBNL associations** : 41 retiré de BE ; qualificatifs de sens sur
BE/DI ; CJ = compte 15 ; RH inclus dans XA ; **compte 46 ajouté à BE
(débiteurs) et DI (créditeurs)** — omis du tableau officiel alors que les
notes 10 et 21 l'exigent.

**SYCEBNL projets** : bilan présenté **en net** (le modèle officiel n'a pas
de colonne amortissements) ; DH exclut 479 (et non 478) ; DI = 499/599 ;
ligne RC (subventions d'exploitation, 71) réintégrée au compte
d'exploitation ; dotations = 68 + 69 ; doublons officiels de codes TJ/TK
reproduits à l'affichage, distingués en interne (TJ2/TK2).

**SMT (deux référentiels)** : classe 2 en net ; découvert bancaire en moins
de l'actif ; 603/73 reclassés en « variation des stocks » ; variations de
créances/dettes (VB/VC) jamais déduites de la balance — saisies depuis
l'inventaire extra-comptable, et laissées à zéro si la balance est en base
engagement (classe 4 mouvementée).

## Exigences de sortie (reprises des moteurs de référence)

- un classeur par liasse, **une feuille par état**, bilan actif et passif
  sur des feuilles séparées ; page de garde ; notes annexes une par
  feuille ;
- **traçabilité** : chaque montant est une formule (équivalent SUMIF sur la
  balance) — dans l'application, prévoir le drill-down poste → comptes ;
- feuilles d'audit : BALANCE N et BALANCE N-1, CONTROLE BALANCE,
  CONTROLES (équilibres et recoupements notes ↔ postes, « doit être 0 »),
  ANOMALIES (gravités BLOQUANT / A_TRAITER / A_VERIFIER / MINEUR / INFO,
  jamais de correction silencieuse) ;
- **présentation de la balance** (huit colonnes, comptes par numéro
  croissant) : `Compte | Intitulé | solde d'ouverture débit-crédit |
  mouvement débit-crédit | solde de clôture débit-crédit`, close par un
  TOTAL GENERAL (un total par solde, débit et crédit) et sa ligne de
  contrôle d'équilibre ; le solde d'ouverture vient des colonnes du fichier
  quand elles existent, sinon de *clôture - mouvements*, jamais approximé
  au-delà. La feuille CONTROLE BALANCE reprend les trois blocs et rend un
  verdict d'équilibre par bloc et par exercice ;
- notes non documentées à ne pas joindre, lignes non chiffrées à supprimer
  avant remise (règle de l'Acte uniforme, à faire respecter à l'export) ;
- **présentation « charte ETAFI »** (alignée sur une liasse fiscale réelle,
  reprise par les moteurs de référence) : cartouche d'identification en
  tête de chaque page (dénomination, adresse, sigle, NCC, NTD, exercice,
  durée, numéro de page), en-têtes de colonnes `#CCFFFF`, rubriques
  `#FFFFCC`, totaux intermédiaires `#C0C0C0`, totaux de section `#008000`
  (texte blanc), TOTAL GENERAL `#000080`, titres d'états Arial Black vert,
  corps Arial 9, format comptable avec zéro affiché « - » ; pages
  Couverture, Garde (documents déposés + zone administration), Fiche 1
  (cases codes ZA…), Fiche 2 (équipe/dirigeants), CONTROLE BALANCE
  (équilibre soldes/mouvements avec verdict), Bilan paysage (actif/passif
  côte à côte), fiche NOTES ANNEXES et TABLE COMMENTAIRE ; ordre des
  feuilles : balances, CONTROLE BALANCE, Couverture, Garde, fiches,
  Bilan paysage, états, notes, TABLE COMMENTAIRE, audit.

## Jeux d'essai

Les balances synthétiques équilibrées et les classeurs générés des cinq
systèmes sont livrés dans `liasse/exemples/` de chaque skill — utilisables
comme jeux d'essai de non-régression pour le module Compta Flow.
