# Dossier Drive « Nouveaux » · TOMPRO et TOMFED face à OmegaX

Relecture du 27 septembre 2026. Lecture seule du Drive et du dépôt : rien n'a
été modifié ni dans l'un ni dans l'autre, à part la création de ce fichier.
Les numéros de page sont les numéros IMPRIMÉS des manuels (bas de page),
pas les numéros de page du fichier PDF.

> **Corrigé le 2026-09-28 (audit final).** Le § 4.3 prêtait à la balance en
> monnaie fonctionnelle la méthode temporelle, qu'elle n'applique pas ; le
> § 4.2 et la proposition P1-8 ignoraient la saisie en devise livrée le
> 2026-09-27. Chaque correction est marquée sur place, avec sa date.

---

## 0. En bref

- Les cinq PDF du dossier ont été lus **en entier**, sur leur couche texte :
  TOMFED p. 1 à 27, ancien manuel TOMPRO p. 1 à 87, manuel TOMPRO récent
  p. 1 à 153. Les deux fichiers complets étant tronqués par l'outil (ancien
  arrêté après la p. 70, récent après la p. 80), les deux « morceaux »
  préparés par l'utilisateur ont comblé exactement la fin. Les captures
  d'écran (176 figures dans le récent) n'ont pas de texte et n'ont pas été
  lues.
- TOMPRO est un progiciel de **gestion de projets financés** plus qu'un
  logiciel comptable : sa valeur est dans les axes croisés (budget, activité,
  financement et catégorie, géographie), les demandes de fonds aux bailleurs
  (DRF, DPD, mémoires UE), les marchés et les états de décaissement. OmegaX
  est très en avance sur la conformité comptable (validation irréversible,
  correction en négatif, états SYCEBNL officiels, notes annexes, contrôles)
  et en retard sur ce circuit « bailleur ».
- **Seize pratiques** des manuels ont été confrontées aux règles codées
  d'OmegaX (section 4). Sur les neuf de la lecture précédente, sept sont
  confirmées, une est à nuancer (frais bancaires) et une est **déclassée** :
  le budget porté par un plan budgétaire distinct ne contredit aucun texte,
  et le Guide d'application SYCEBNL (APPLICATION 22, règle (b)) va même dans
  le sens de TOMPRO (« budget de l'exercice du projet, compte par compte »).
  Sept pratiques nouvelles ont été relevées, dont trois franches : résultat
  viré à la clôture sur un « compte de capitalisation » choisi librement,
  états financiers paramétrés ligne à ligne, plan de comptes propre avec
  passerelle vers la balance SYSCOA.
- Autre point à trancher par un humain : l'amortissement « au jour »
  (TOMPRO) contre « au mois » (OmegaX). La règle codée d'OmegaX vient d'un
  article FISCAL (loi n° 23/053, art. 34), alors que les ASBL sont exemptées
  d'impôt sur les sociétés par l'art. 5, 3° de la même loi. Le texte
  comptable (AUDCIF art. 45, SYCEBNL compte 28) ne tranche pas entre jour et
  mois.
- **35 propositions** (section 5) : P1-1 à P1-9, P2-1 à P2-11, P3-1 à P3-15.
  Les plus rentables pour l'usage quotidien : section analytique par défaut
  par compte, clés de répartition, lignes budgétaires détaillées avec compte,
  versions de budget, saisie en devise dans la grille.

---

## 1. Méthode et limites

### 1.1 Pages lues, document par document

| Document | Fichier lu | Ce que l'outil a rendu | Pages imprimées couvertes |
|---|---|---|---|
| TOMFED, annexe UE | `636227572-TOMFED-Annexe.pdf` | texte complet, sans troncature | **1 à 27, tout** |
| TOMPRO ancien | `602321556-ManuelTompro.pdf` (complet, 8,6 Mo) | tronqué à 60 230 caractères, arrêt sur le titre « Gestion des marchés » en bas de p. 70 | 1 à 70 |
| TOMPRO ancien | `602321556-ManuelTompro.pdf` (morceau, 5,8 Mo) | texte complet du morceau | 45 à 87 |
| TOMPRO récent | `548739190-Manuel-Tompro.pdf` (complet, 10,3 Mo) | tronqué à 106 786 caractères, arrêt sur « La réallocation budgétaire se fait dans l'écran suivant : » en bas de p. 80 | 1 à 80 |
| TOMPRO récent | `548739190-Manuel-Tompro.pdf` (morceau, 6,1 Mo) | texte complet du morceau (82 251 caractères), de la « Fig. 91 » à la conclusion | 81 à 153 |

Résultat : **ancien manuel 1 à 87 lu en entier** (recouvrement 45 à 70 lu
deux fois, identique) ; **manuel récent 1 à 153 lu en entier**, la jonction
tombant exactement entre la p. 80 et la p. 81 ; **TOMFED 1 à 27**.

### 1.2 Limites

- **Couche texte seulement.** Les captures d'écran ne sont pas lues : les
  listes de champs visibles uniquement à l'écran sont inconnues. Les
  légendes « Fig. n » du manuel récent sont lues, pas leur contenu.
- **Ordre du texte parfois brouillé par l'extraction** (récent p. 13 à 15 :
  les sous-titres « Les sites » et « Les unités » sont intervertis ;
  « Dans les paramètres régionaux se trouvent : les unités et les
  emplacements » est une coquille du manuel pour « autres paramètres »).
- **Anomalies des manuels eux-mêmes**, signalées et non corrigées :
  l'ancien manuel imprime deux fois le numéro 52 ; l'annexe TOMFED numérote
  deux sections « 4.2 » (p. 16 et 17) ; le sommaire de l'ancien manuel
  écrit « Convention des devises » pour « Conversion » (p. 59) ; et surtout
  la règle de correction est écrite à l'envers (voir 4.1).
- **Côté OmegaX**, lecture du code et du schéma Prisma, sans exécution (ni
  `jest` ni `tsc`, conformément à la consigne). Les articles cités en
  section 4 ont été relus dans les compétences installées
  (`audcif-acte-uniforme`, `sycebnl`, `fiscalite-rdc`) le jour même, pas
  seulement dans les commentaires du code.
- La « lecture précédente » citée par la mission n'est pas dans le dépôt
  (aucun fichier ne mentionne TOMFED ; TOMPRO n'apparaît que dans
  `docs/prix-concurrents-2026-09.md`, pour son prix). Ses listes ont été
  reprises depuis l'énoncé de la mission et revérifiées une à une.

---

## 2. Inventaire des fichiers

Dossier Drive « Nouveaux » (id `1iNGis2rw-lQOLwre6eW-6RvgoFI5uA4O`, créé le
26/09/2026). Cinq fichiers, tous PDF, tous appartenant à l'utilisateur.

| # | Nom | Id Drive | Taille | Créé | Nature |
|---|---|---|---|---|---|
| 1 | `636227572-TOMFED-Annexe.pdf` | `1aKc0BSpwfWltAEoAQOPKJopE-48H1KhF` | 0,9 Mo | 26/09 21:02 | Annexe TOMFED, « Manuel pour les projets Union Européenne », T.O.M.A.T.E., daté du 19/12/05, 27 p. |
| 2 | `602321556-ManuelTompro.pdf` | `19BOvzZWHe7bLAHESBkPqbymlyZqU4gUx` | 8,6 Mo | 26/09 21:02 | TOMPRO Windows, ancien manuel complet, 87 p. imprimées (exemples en FRF, exercice 1994) |
| 3 | `548739190-Manuel-Tompro.pdf` | `1KNo5B6b2fs3o10iiTegUDx2U3qJ02_qX` | 10,3 Mo | 26/09 21:02 | Manuel TOMPRO récent complet, 153 p., 176 figures (exemples en XOF, exercice 2004, relevé 2005) |
| 4 | `548739190-Manuel-Tompro.pdf` | `10MNHxJsEzh_rKf6yLM_UYfdAdmD7IZQL` | 6,1 Mo | 26/09 21:30 | Morceau du n° 3, p. 81 à 153 |
| 5 | `602321556-ManuelTompro.pdf` | `1V23gwDcalvWoru25belhloOkZYSnALad` | 5,8 Mo | 26/09 21:31 | Morceau du n° 2, p. 45 à 87 |

Les morceaux portent le **même nom** que les fichiers complets : on les
distingue par l'id, la taille et l'heure de création.

---

## 3. Fiches des documents, puis les manuels face à OmegaX

### 3.1 TOMFED, annexe « projets Union européenne » (27 p.)

Complément de TOMPRO pour les procédures du FED. Idées maîtresses :

- **Trois nomenclatures** : bailleur (procédure « DP FED », codification
  organisme + numéro du FED, p. 4), convention rattachée au bailleur avec
  deux monnaies de suivi et une monnaie d'émission des mémoires (p. 5),
  **devis-programme** (p. 6 à 8).
- **Le devis-programme (DP)** est une tranche étanche d'une convention, dont
  la durée « ne suit pas nécessairement les années civiles et exercices
  comptables » (p. 6). Il porte une période initiale, une caisse d'avance
  (montant, fourchette de caisses et de banques), le compte bancaire
  bénéficiaire ; il se proroge et se clôture sous mot de passe (p. 7 et 8).
- **Chaque pièce porte un DP** et un type de dépense, « régie » ou
  « engagement spécifique » (p. 9) ; toutes les éditions (journaux, grands
  livres, balances, recherche de mouvements) se filtrent par DP et par type,
  y compris « mouvements sans DP » pour retrouver les oublis (p. 12 et 13).
- **Budget par DP**, avec type de dépense par ligne (p. 14 et 15), et
  **réallocation** d'un DP vers un autre par coefficient (p. 16).
- **Suivi des décaissements et analytique par DP** (p. 18 et 19).
- **Mémoires de dépenses** : montants alloués par DP et catégorie financière
  (p. 20), tri des mouvements sur dates comptables (p. 21), brouillard à
  pointer, indicateur Facturable / Non facturable pour repousser une pièce
  sans justificatif au mémoire suivant (p. 22 et 23), états détaillés et
  récapitulatifs, situation du DP, justificatif de la caisse d'avance
  (p. 24 à 26), conversion aux cours des monnaies de suivi puis **mise à
  jour** qui marque les pièces pour qu'elles ne reviennent plus, après
  sauvegarde archivée (p. 26 et 27).

### 3.2 TOMPRO, ancien manuel (87 p.)

Neuf chapitres : paramètres (p. 4 à 21), comptabilité générale (21 à 38),
analytique (38 à 44), suivi budgétaire (44 à 51), suivi financier DRF / DPD
(51 à 59), immobilisations (59 à 63), états financiers et états LACI / REP
(63 à 70), marchés (70 à 78), utilitaires (78 à 84). C'est la même
architecture que le manuel récent, en plus pauvre : budget à 3 modes de
répartition, 4 modèles de DRF, pas de monnaie de rapport, pas de cours, pas
de RSF, pas de lettres de garantie, pas d'états de décaissement. Seules
différences de fond relevées : les clés de répartition « au cours de la
saisie » (p. 41) et l'option « Tous / Paramètres / Mouvements » de la purge
(p. 82), identiques au récent ; la règle de correction (p. 28) porte déjà la
même anomalie que le récent.

### 3.3 TOMPRO, manuel récent (153 p.)

Dix chapitres. Ce qui est nouveau par rapport à l'ancien :

- **Paramètres** (p. 9 à 33) : entête avec monnaie du REP et son cours,
  gestion des échéances, BR et OV, **test sur numéro de pièce**,
  numérotation des immobilisations par site et année (p. 12), **double
  libellé** bilingue et **monnaie de rapport** (p. 13), comptes de frais
  bancaires (p. 13), emplacements (p. 15), structures de plans à 10 niveaux
  (p. 16), liaisons compte ↔ activité et compte ↔ poste avec forçage signalé
  (p. 24 et 25), **comportement obligatoire** des comptes (caisse jamais
  créditrice, contrôlée à la validation) et sens par défaut (p. 26),
  échéance tiers « 30 jours le 15 » et duplication des auxiliaires (p. 27),
  journal « exclu des mémoires » et journal à **devise imposée** (p. 28),
  numérotation automatique (p. 29), procédure financière du bailleur (p. 29),
  catégories financières avec **seuil de pièces jointes** (p. 32),
  ventilation de co-financement à taux différents en monnaie locale et en
  devises (p. 33).
- **Comptabilité générale** (p. 34 à 63) : saisie en deux temps avec cours
  proposé (p. 38 et 39), apurement total ou partiel des tiers avec frais
  bancaires (p. 39), tableau des automatismes de saisie (p. 40), correction
  des écritures (p. 40 et 41), rapprochement avec **mouvements
  extra-comptables** (p. 42 à 45), lettrage par numéro de pièce, délettrage,
  **prélettrage** (p. 45 à 48), table des cours et conversion en monnaie de
  rapport (p. 48 et 49), recherche multicritère très riche (p. 53 à 55),
  exports Excel (p. 59), BR / OV (p. 59 et 60), clôtures mensuelle et
  annuelle, **à-nouveaux provisoires** (p. 61 et 62), balance SYSCOA (p. 63).
- **Analytique** (p. 64 à 73) : clés de répartition **a priori** (p. 68 et
  69), **ventilation a posteriori** (p. 69 et 70), balances mono et
  bi-critères, tableau récapitulatif à axes choisis, récapitulatif sur 5 ans.
- **Budget** (p. 74 à 87) : **10 budgets** nommés (p. 77 et 78), ligne
  budgétaire = compte × poste × convention × catégorie × géographie ×
  activité × unité × prix × quantité, 6 modes de répartition (p. 79 et 80),
  **réallocation** par duplication et coefficient, par critère (p. 80 et
  81), **comparaison de deux budgets** (p. 82), analyses mono, bi-critères,
  par période, récapitulative, sur 5 ans, **situation mensuelle** (p. 82
  à 87).
- **Suivi des conventions IDA** (p. 88 à 98) : montants par convention et
  catégorie en monnaie locale et deux monnaies de suivi, réallocations
  datées, DRF (tri des seules dépenses payées, option rapprochées seulement,
  brouillard F / N, 7 modèles dont SOE, listes avec et sans PJ, mise à jour,
  **régularisation payé / rejeté / litige / apuré**, situation de la
  convention, récapitulatifs par catégorie, journal, site), DPD par journal
  de prise en charge.
- **Immobilisations** (p. 99 à 103) : fiche liée ou non à la facture,
  financements en pourcentage, dernière évaluation, cession, amortissements
  antérieurs (p. 101 et 102), **affectations** successives (p. 102), 5 états
  dont **rapprochement avec la comptabilité** et tableau d'amortissement
  « par jour (préconisé) ou par mois » (p. 103).
- **États financiers** (p. 104 à 121) : bilan, compte de résultat, emplois
  et ressources **paramétrés par l'utilisateur** en 10 modèles (p. 106 à
  111), états LACI 1A à 3D dont **1E compte spécial** (p. 112 à 118),
  passerelle SYSCOA (p. 119), **5 modèles RSF** base décaissements ou
  engagements (p. 120 et 121).
- **Marchés et engagements** (p. 122 à 132) : types de passation, **schémas
  de décaissement** sur 24 mois, **schémas comptables par type de marché**
  (avance, remboursement d'avance, travaux, pénalités, primes, retenue de
  garantie et sa restitution), fiche de marché datée (OS, réception
  provisoire prévue et réelle, non-objection, réception définitive),
  ventilation du montant, **lettres de garantie**, apurement automatique des
  engagements par les décomptes, tableau récapitulatif avec soldes de
  facturation et de règlement.
- **États de décaissements** (p. 133 à 142) : décaissement = toute sortie
  par un journal de trésorerie ; analyses, grand livre des décaissements,
  **tableau de bord à 8 colonnes et formules** (p. 141 et 142), **budget de
  trésorerie** alimenté par les budgets et les marchés (p. 135 et 142).
- **Utilitaires** (p. 143 à 152) : sauvegarde quotidienne préconisée,
  réparation, compactage, **purge**, exports siège ↔ sites, consolidation
  TOMCONSO, passerelle TECPRO, **diagnostic** et statistiques de saisie par
  utilisateur, journal, site, traduction en 4 langues.

### 3.4 Les deux manuels face à OmegaX

Légende : **Oui** = OmegaX le fait ; **Partiel** = une brique existe ;
**Non** = absent. Chemins relatifs à la racine du dépôt.

| Fonction TOMPRO | Pages | OmegaX | Où, dans le dépôt | Ce qui manque |
|---|---|---|---|---|
| Utilisateurs, groupes, droits | anc. 2 à 4 ; réc. 4 à 7 | Oui | `src/modules/utilisateurs`, `src/modules/auth` | rien d'utile |
| Plan comptable, tiers, journaux | réc. 23 à 29 | Oui | `src/modules/comptes`, `src/modules/tiers`, `src/modules/journaux` | sens par défaut, comportement bloquant |
| Numérotation automatique des pièces | réc. 29 | Oui | `src/modules/journaux/numerotation-piece.ts`, `sequence-pieces.ts` | contrôle de doublon de la **référence** externe |
| Saisie par pièce, contrepartie automatique | réc. 37 à 40 | Oui | `src/modules/comptabilite/ecriture.service.ts`, `Journal.contrepartieChaqueLigne` | automatismes compte → activité / poste |
| Correction des écritures | réc. 40 et 41 | Oui, **autrement** | correction en négatif (`Ecriture.corrigeEcritureId`), réimputation (`comptabilite/reimputation.ts`) | rien : voir 4.1 |
| Rapprochement bancaire | réc. 42 à 45 | Oui | `src/modules/rapprochement`, `LigneReleveBancaire` | historique « relevé de rapprochement » des extra-comptables |
| Lettrage, délettrage, prélettrage | réc. 45 à 48 | Oui | `src/modules/lettrage`, `StatutLettrage.PARTIEL`, `OrigineLettrage.AUTOMATIQUE_PIECE` | rien de fond |
| Cours, conversion | réc. 48 et 49 | Partiel | `CoursDevise`, `src/modules/devises/devises.service.ts`, `src/modules/monnaie-fonctionnelle` | saisie en devise dans la grille (`client/src/pages/SaisiePage.tsx` n'a aucun champ devise) |
| Recherche multicritère | réc. 53 à 55 | Partiel | `src/modules/comptabilite/recherche-ecritures.ts` (texte, compte, montants, pièce, référence) | utilisateur, date de saisie, avec / sans analytique, résultat en balance |
| Échéancier, balance âgée, relances | réc. 27, 47 | Oui | `EcheancierPage.tsx`, `BalanceAgeePage.tsx`, `src/modules/relances` | échéance « le 15 » |
| BR / OV | réc. 59 et 60 | Oui | `src/modules/reglements/ordres-virement.service.ts`, `lots-virement.ts` | rien |
| Clôtures, à-nouveaux provisoires | réc. 61 et 62 | Oui | `Cloture`, `src/modules/exercice`, `Ecriture.estANouveauProvisoire` | rien (voir 4.10 pour le compte de résultat) |
| Clés de répartition a priori | réc. 68 et 69 ; anc. 40 et 41 | **Non** | `ModeleSaisie` n'a pas de section | clé code + % par section, appel à la saisie |
| Ventilation a posteriori | réc. 69 et 70 | Oui | OD analytiques (`src/modules/analytique/od-analytique.ts`) | rien |
| Balance, grand livre analytique | réc. 71 à 73 | Oui | `src/modules/analytique/etats-analytiques.service.ts` | croisement de deux plans |
| Budget | réc. 77 à 87 | Partiel | `BudgetSection`, `analytique.service.ts` (`doterBudget`, `modifierBudgetMois`), `rubriques-budgetaires.ts` | lignes détaillées, compte, versions, réallocation, analyses bi-critères et mensuelles |
| Engagements hors comptabilité | réc. 126 à 132 | Partiel | `EngagementDepense`, `ExecutionEngagement`, `engagement.service.ts` | fiche de marché, schémas comptables, garanties |
| Conventions, tranches, rapports | réc. 29 à 33, 91 à 98 | Partiel | `ConventionFinancement`, `TrancheFinancement`, `RapportBailleur` | catégories financières, DRF / DPD, monnaies de suivi |
| Immobilisations | réc. 101 à 103 | Oui, plus riche | `src/modules/immobilisations` (composants, dégressif, dérogatoire, unités d'œuvre, antérieur, lieux) | financement du bien, historique d'affectation, rapprochement avec la classe 2 |
| États financiers | réc. 106 à 121 | Oui, **officiels** | `src/modules/etats-financiers` (SYCEBNL, 3 jeux), `src/modules/notes-annexes`, `src/modules/etats-personnalises` | RSF, LACI, compte spécial |
| États de décaissement, tableau de bord | réc. 135 à 142 | Partiel | tableau d'exécution budgétaire (`etats-financiers-projet-budget.service.ts`) | grand livre des décaissements, budget de trésorerie |
| Sauvegarde, restitution | réc. 145 et 146 | Oui | `.github/workflows/sauvegarde-base.yml`, `src/modules/exports/restitution` | rien |
| Multi-sites, consolidation | réc. 148 | Oui, autrement | `src/modules/groupe`, `src/modules/consolidation` | rien |
| Diagnostic, statistiques | réc. 149 à 151 | Partiel | `src/modules/controles`, `JournalAuditPage.tsx`, `PalmaresJournauxPage.tsx` | statistiques par utilisateur |
| Double libellé, traduction | réc. 13, 151 | Non | | libellé bailleur (anglais) |

---

## 4. Ce qui contredirait une règle déjà codée

Pour chaque pratique : la page du manuel, la règle d'OmegaX, le fichier qui
la porte, le texte relu. Verdict en tête : **Confirmé** (contredit un texte
et la règle codée), **À nuancer**, **Déclassé** (ne contredit que le choix
d'architecture d'OmegaX, pas un texte), **Nouveau**.

### 4.1 Correction libre d'écritures validées · Confirmé

- **TOMPRO** : « Une fois le bordereau validé, vous ne pouvez plus revenir
  sur les mouvements saisis dans la présente option (pour les modifier,
  utiliser l'option correction des écritures) » (réc. p. 38 ; anc. p. 26).
  La correction change « le numéro de la pièce, la date comptable, la date
  de la pièce, le libellé, [...] le montant » (réc. p. 40 ; anc. p. 28), et
  complète « à postériori le montant en devise » (réc. p. 41 ; anc. p. 29).
- **Anomalie du manuel, à ne pas corriger en silence** : la condition est
  écrite « Seuls les mouvements non lettrés, n'ayant pas fait l'objet d'une
  DRF et **antérieurs** à la date de la dernière clôture peuvent être
  modifiés » (réc. p. 41 ; anc. p. 28 sans la DRF), alors que la p. 61 du
  récent (anc. p. 38) dit l'inverse : « les mouvements antérieurs à la date
  de clôture ne peuvent plus être modifiés ». La lecture cohérente est
  « postérieurs » ; dans les deux cas, un mouvement validé et non clôturé
  reste modifiable.
- **Règle d'OmegaX** : une écriture VALIDÉE ne se modifie plus ; la seule
  voie est l'inscription en négatif puis l'enregistrement exact ; aucun
  chemin de dévalidation n'existe.
  `src/modules/comptabilite/ecriture.service.ts` (`trouverEnBrouillard`,
  message « elle est entrée au livre-journal et ne se modifie plus » ;
  commentaire de `valider`) ; `Ecriture.corrigeEcritureId` et
  `motifCorrection` dans `prisma/schema.prisma` ; test
  `src/modules/etats-financiers/correction-inscription-negatif.spec.ts`.
- **Textes relus** : AUDCIF **art. 20** (« Toute correction d'erreur commise
  et découverte sur l'exercice en cours s'effectue exclusivement par
  inscription en négatif des éléments erronés ») et **art. 22, 2°**
  (« l'irréversibilité des traitements interdise toute suppression, addition
  ou modification ultérieure »), non exclus par l'art. 3 du SYCEBNL ; repris
  mot pour mot par le SYCEBNL, Partie 2 ch. 2 et cadre conceptuel.

### 4.2 « Cours le plus proche » de la date de transaction · Confirmé

- **TOMPRO** : « si vous avez saisi des cours [...], le cours le plus proche
  de la date de transaction est affiché » (réc. p. 39) ; « le système
  propose le cours le plus proche de la date de la transaction » (réc.
  p. 48). Le plus proche peut être **postérieur** à l'opération.
- **Règle d'OmegaX** : « Cours applicable à une date : le dernier coté à
  cette date ou avant. Une cotation postérieure n'est pas retenue »
  (`coursA`, `src/modules/devises/devises.service.ts`, requête
  `date: { lte: date }`).
- **Textes relus** : AUDCIF **art. 51** (biens : « cours de change du jour de
  l'acquisition ») et **art. 52** (créances et dettes : cours « à la date de
  formalisation de l'accord des parties » ou « de mise à disposition des
  devises »).
- **Précision** : la règle n'est aujourd'hui portée que par la réévaluation ;
  la grille de saisie d'OmegaX ne propose aucun cours (P1-8). C'est à la
  construction de P1-8 que le piège se présentera.
- **Précision révolue, note du 2026-09-28 (audit final)** : la même règle
  est portée depuis le 2026-09-27 par la grille de saisie, qui PROPOSE le
  dernier cours coté au plus tard à la date de la pièce, le champ restant
  modifiable (`coursPropose`, `client/src/lib/ligne-en-devise.ts`, audit
  final F49), et par la balance en monnaie fonctionnelle (`coursApplicable`,
  voir 4.3). Un cours postérieur n'est retenu nulle part.

### 4.3 Conversion au cours moyen · Confirmé, portée précisée

- **TOMPRO** : « conversion de la monnaie locale dans les deux monnaies de
  suivi du projet, au taux de change moyen appliqué dans le journal » (réc.
  p. 97 ; anc. p. 59) ; monnaie de rapport : « Pour les autres monnaies, un
  cours moyen est exigé » (réc. p. 13) ; un cours moyen unique pour tout un
  état, bilan compris (LACI 1A et 1C, réc. p. 117 et 118 ; analytique p. 71 ;
  budget p. 82 et 83 ; décaissements p. 138) ; budget en devises « indiquez
  le taux de conversion » (anc. p. 47).
- **Règle d'OmegaX** (corrigée le 2026-09-28, audit final · cette ligne
  disait que la balance en monnaie fonctionnelle applique la méthode
  temporelle, monétaire au cours de clôture et résultat par différence, ce
  qui est faux) : la balance en monnaie fonctionnelle convertit **ligne à
  ligne**, chaque écriture au cours **en vigueur à sa date** (le dernier
  saisi à cette date ou avant, `coursApplicable`, jamais un postérieur),
  toutes les lignes d'une écriture au même cours. Une ligne déjà libellée
  dans la monnaie fonctionnelle garde son montant d'origine
  (`convertirLigne`), et l'écart de conversion qui en naît est montré sur sa
  propre ligne. L'à-nouveau ne se convertit pas · l'ouverture reprend la
  clôture du même jeu pour l'exercice précédent (`jeuFonctionnel`). Aucun
  cours moyen, aucun cours de clôture.
  `src/modules/monnaie-fonctionnelle/balance-fonctionnelle.service.ts` ;
  `CLAUDE.md`, paragraphe « M2 · la balance en monnaie fonctionnelle, ligne à
  ligne au cours historique ». `docs/conversion-monnaie-fonctionnelle.md`
  décrit la méthode temporelle et porte depuis le 2026-09-28 un bandeau qui
  dit qu'elle n'a pas été retenue.
- **Texte relu** : AUDCIF, Titre XII, **chapitre XII-4, section 2** : le
  cours moyen n'est admis que pour les **produits et charges** « s'il est
  proche du cours réel », jamais pour le bilan. **Portée** (corrigée le
  2026-09-28) : ce chapitre régit la conversion des entités étrangères
  consolidées, et c'est là seulement qu'OmegaX l'applique (consolidation
  SYSCOHADA, tranche 4c · méthode du cours de clôture, charges et produits au
  cours moyen ou de clôture déclaré). Il n'est pas appliqué, même par
  analogie, au second jeu d'une entité seule · aucun texte lu ne régit ce
  jeu, et sa méthode est une décision de l'éditeur (`CLAUDE.md`, « M2 »). Le
  verdict tient, sur ce fondement-là : le cours moyen unique de TOMPRO reste
  acceptable pour un **rapport au bailleur** (situation de convention) qui ne
  prétend pas être le bilan ; OmegaX ne l'emploie pas pour son second jeu,
  qui reste historique écriture par écriture.

### 4.4 Frais bancaires glissés dans la pièce de règlement · À nuancer

- **TOMPRO** : lors d'un apurement de tiers dans un journal de trésorerie,
  « vous pouvez également imputer les frais bancaires (seuls les comptes
  paramétrés dans l'entête du projet sont acceptés) » (réc. p. 39 ; comptes
  paramétrés p. 13).
- **Règle d'OmegaX** : « Le règlement ne touche donc JAMAIS une charge ni un
  produit · il solde un tiers contre la trésorerie, et c'est tout »
  (`src/modules/reglements/reglement-tiers.ts`, `lignesDuReglement` : deux
  lignes, tiers et trésorerie).
- **Textes relus** : SYCEBNL, **compte 40** (« débité [...] des règlements
  effectués sur factures ; par le crédit : des comptes de trésorerie ») ;
  **compte 631 « Frais bancaires »** (classe 6) et exclusions du compte 67
  qui y renvoient ; AUDCIF **art. 16** (enregistrement « opération par
  opération ») et **art. 17, 5°** (chaque enregistrement référence sa pièce
  justificative).
- **Nuance** : aucun texte n'interdit une écriture de trésorerie à trois
  lignes. Le conflit est avec la règle d'OmegaX et avec la pièce : les frais
  sont justifiés par l'avis ou le relevé de la banque, pas par la facture
  réglée. Si OmegaX l'offre un jour, ce devrait être une **seconde écriture**
  liée, sur 631, avec sa propre référence.

### 4.5 Revalidation forcée d'un bordereau · Confirmé

- **TOMFED** : si le DP a été omis ou le type de dépense erroné, « simuler
  une modification de ligne comptable (pour pouvoir accéder à la validation
  du bordereau) », puis « valider le bordereau » (p. 11).
- **Règle d'OmegaX** : pas de dévalidation (voir 4.1). En revanche la
  **ventilation analytique** d'une ligne validée reste modifiable tant que la
  ligne n'est pas figée par une clôture totale, de période ou d'exercice
  (`ventilerLigne`, `src/modules/analytique/analytique.service.ts` ;
  `refuserSiLignesFigees`, `src/modules/exercice/gel-cloture.ts`), et l'OD
  analytique corrige sans toucher l'écriture (`od-analytique.ts`).
- **Texte relu** : AUDCIF **art. 22, 2°**.
- **Conséquence pour P2-3** : un DP doit être un **axe analytique** (une
  ventilation), jamais un champ de l'écriture ; sinon son oubli ne se
  corrige plus.

### 4.6 Budget par poste séparé des sections · Déclassé

- **TOMPRO** : plan budgétaire propre (chapitres, rubriques, postes ; anc.
  p. 11 et 12 ; réc. p. 20 et 21), lié aux comptes (réc. p. 25), ligne
  budgétaire croisant compte, poste, catégorie, géographie et activité
  (réc. p. 79).
- **Règle d'OmegaX** : « Le budget n'a pas de plan à lui : il se porte sur
  les sections analytiques » (commentaire de `PlanAnalytique`,
  `prisma/schema.prisma`) ; la nomenclature budgétaire du tableau
  d'exécution est un plan analytique
  (`src/modules/etats-financiers/etats-financiers-projet-budget.service.ts`).
- **Texte relu** : SYCEBNL, Guide d'application, ch. 7, **APPLICATION 22** :
  (a) « Remplir code et libellé suivant la nomenclature budgétaire du
  projet » ; (b) « Le plan comptable doit être conçu en tenant compte du
  budget du projet ; cette rubrique est remplie au vu du budget de
  l'exercice du projet, **compte par compte** » ; (c) décaissement « si le
  plan comptable est conçu sur la base du budget ».
- **Verdict** : aucun texte n'impose que le budget vive sur les sections.
  Le texte suppose au contraire un lien budget ↔ compte, que TOMPRO a et
  qu'OmegaX n'a pas. Ce n'est pas une contradiction : c'est un **écart
  d'OmegaX au texte**, qui justifie P1-4 (ajouter le compte à la ligne
  budgétaire) plutôt qu'un refus.

### 4.7 Purge des écritures des années antérieures · Confirmé

- **TOMPRO** : « supprimer définitivement de la base certaines données dont
  on a plus besoin pour les traitements (cas des écritures des années
  antérieures par exemple) », options « Tous », « Paramètres »,
  « Mouvements seulement », sous mot de passe (réc. p. 146 et 147 ; anc.
  p. 82).
- **Règle d'OmegaX** : aucun chemin de purge ; la suppression d'une écriture
  n'existe qu'au brouillard (`ecriture.service.ts`) ; la restitution
  rappelle l'obligation de conservation
  (`src/modules/exports/restitution/manifeste-restitution.ts`).
- **Textes relus** : AUDCIF **art. 24** (livres et pièces « conservés
  pendant dix ans ») ; **art. 22, 2° et 5°** (irréversibilité, intégrité).

### 4.8 Amortissement au jour · À nuancer, question ouverte

- **TOMPRO** : tableau d'amortissement, « calcul par jour (préconisé) ou par
  mois » (réc. p. 103).
- **Règle d'OmegaX** : première annuité au prorata « à compter du premier
  jour du mois de mise en service », dans les deux référentiels
  (`src/modules/immobilisations/immobilisation.service.ts`, commentaire
  « CITATION CORRIGÉE »).
- **Textes relus** : loi n° 23/053, **art. 34** (« La première annuité
  d'amortissement est calculée prorata temporis à compter du premier jour
  du mois de mise en service ou de création du bien ») ; AUDCIF **art. 45**
  et SYCEBNL **compte 28** (début d'amortissement = date où l'actif est
  « en état de fonctionner »), qui ne disent ni jour ni mois ; loi
  n° 23/053, **art. 5, 3°** (« Sont exemptés de l'Impôt sur les Sociétés :
  [...] les Associations sans but lucratif »).
- **Verdict** : le calcul au jour contredit la règle codée, pas le texte
  comptable. Pour un dossier SYSCOHADA, OmegaX a raison de s'aligner sur
  l'art. 34 (sinon un écart fiscal à retraiter). Pour un dossier SYCEBNL,
  la règle repose sur une loi fiscale qui ne s'applique pas à une ASBL
  exemptée. **À trancher par Manasse** ; ne rien changer sans décision.

### 4.9 Évaluation isolée d'un bien qui change sa base d'amortissement · Confirmé

- **TOMPRO** : « La date et montant de la dernière évaluation : dans le cas
  où une évaluation a été faite. Le système se basera sur ces chiffres pour
  calculer les amortissements » (réc. p. 102 ; anc. p. 62), fiche par fiche.
- **Règle d'OmegaX** : le module garde la valeur d'origine ; toute
  réévaluation passée hors module est signalée
  (`REEVALUATION_IMMO_HORS_MODULE` et `DECLARATION_REEVALUATION_A_DEPOSER`,
  `src/modules/controles/controles.service.ts`).
- **Textes relus** : AUDCIF **art. 62** (réévaluation des immobilisations
  corporelles et financières ; « Toute réévaluation partielle est
  interdite »), **63**, **64** (base des amortissements depuis l'ouverture
  de l'exercice de réévaluation), **65** ; SYCEBNL cadre conceptuel
  § 5.2.1.2 (renvoi aux art. 62 à 65). Une perte de valeur isolée relève de
  la **dépréciation** (art. 46), que le module sait faire.

### 4.10 Résultat viré sur un « compte de capitalisation » choisi · Nouveau, confirmé

- **TOMPRO** : clôture annuelle, « Il faut sélectionner un compte de
  capitalisation pour stocker le résultat de l'exercice » ; même choix pour
  les à-nouveaux provisoires (réc. p. 62).
- **Règle d'OmegaX** : la clôture solde les classes 6, 7 et 8 sur le 131 ou
  le 139, jamais ailleurs ; l'affectation est une opération distincte
  (`src/modules/exercice/exercice.service.ts`, commentaires l. 37 à 65 et
  608 à 624 ; modèle `AffectationResultat`).
- **Texte relu** : SYCEBNL **comptes 12 et 13** : le 13 est crédité ou
  débité « à la clôture de l'exercice » par les comptes de gestion, et
  « l'affectation du résultat net [...] résulte des dispositions
  statutaires, réglementaires ou de la décision des organes compétents. Le
  compte 13 est donc soldé lors de la comptabilisation de cette
  affectation » ; pour un projet, « le solde des opérations de l'exercice
  [...] est toujours nul ». Virer le résultat sur un 10, 11 ou 12 choisi à la
  clôture préjuge de la décision de l'assemblée.

### 4.11 États financiers paramétrés ligne à ligne · Nouveau, confirmé

- **TOMPRO** : bilan, compte de résultat, emplois et ressources construits
  par l'utilisateur en fourchettes de comptes, jusqu'à 10 modèles « afin que
  les utilisateurs de l'État puissent avoir une forme qui leur sied »
  (réc. p. 106 à 111 ; anc. p. 65 à 68 ; LACI 1C p. 114).
- **Règle d'OmegaX** : les états officiels ont des correspondances fixes,
  testées (`src/modules/etats-financiers/correspondance-bilan.ts`,
  `correspondance-compte-resultat.ts`, `correspondance-projet-*.ts`) ; le
  paramétrable existe à part, comme état de gestion
  (`src/modules/etats-personnalises/moteur-etat-personnalise.ts`).
- **Textes relus** : SYCEBNL, **art. 4** (« établis et présentés
  conformément aux modèles du Système comptable des entités à but non
  lucratif ») et **art. 16, 6)** (« la présentation des états financiers est
  identique d'un exercice à l'autre ») ; AUDCIF **art. 25** pour un dossier
  SYSCOHADA (article exclu pour le SYCEBNL par son art. 3).
- **Nuance** : un état au format du bailleur est légitime tant qu'il ne se
  présente pas comme les états financiers annuels. C'est exactement la
  séparation qu'OmegaX fait déjà.

### 4.12 Plan de comptes propre et passerelle SYSCOA · Nouveau, confirmé

- **TOMPRO** : « Cette option permet à l'utilisateur de créer son propre
  plan comptable » (anc. p. 15 ; réc. p. 24), puis une table de
  correspondance « entre la balance TOMPRO et la balance SYSCOA » (réc.
  p. 63 et 119).
- **Règle d'OmegaX** : plan semé depuis le plan officiel, complété à 8
  chiffres (CLAUDE.md § 7 ; `src/modules/comptes/compte-seed.ts`,
  `compte-seed-syscohada.ts`) et contrôle `COMPTE_HORS_NOMENCLATURE`
  (`controles.service.ts`).
- **Textes relus** : SYCEBNL **art. 16, 1)** (« le recours [...] à un plan de
  comptes normalisé dont la liste figure dans le Système comptable des
  entités à but non lucratif ») ; AUDCIF **art. 17, 7°** pour le SYSCOHADA.
  Une passerelle a posteriori n'est pas un plan normalisé : les livres sont
  tenus sur un autre plan.

### 4.13 Libellés de pièces retouchés pour présenter un mémoire · Nouveau, confirmé

- **TOMFED** : « améliorer la présentation des mémoires en corrigeant les
  libellés des pièces comptables » (p. 23) ; en cas d'erreur d'imputation,
  « procéder à la correction dans le module comptabilité générale et
  relancer le tri » (p. 22).
- **Règle et texte** : ceux de 4.1 (AUDCIF art. 22, 2°). La présentation
  d'un mémoire doit porter **son propre libellé**, à côté de celui de
  l'écriture, jamais à sa place (voir P2-2).

### 4.14 Taux d'amortissement « défini en fonction des législations du pays » · Nouveau, à nuancer

- **TOMPRO** : « Le taux d'amortissement : taux défini en fonction des
  législations du pays, suivant le type d'immobilisation » (réc. p. 101).
- **Règle d'OmegaX** : durée d'utilité comptable par famille, **semée**
  depuis l'arrêté n° 013/2025 mais personnalisable ; le dégressif fiscal est
  une option qui « laisse le plan comptable intact », l'écart passant en
  dérogatoire (`FamilleImmobilisation` et `Immobilisation.degressifFiscal`
  dans `prisma/schema.prisma` ; `immobilisations/amortissement-degressif.ts`).
- **Texte relu** : AUDCIF **art. 45** (durée d'utilité « définie en fonction
  de l'utilité attendue de l'actif pour l'entité »).
- **Nuance** : OmegaX part lui aussi des taux de l'arrêté par défaut. La
  contradiction n'apparaît que si un taux fiscal accéléré ou dégressif
  devient le plan comptable.

### 4.15 Fiche d'immobilisation extra-comptable · Nouveau, règle d'architecture sans texte

- **TOMPRO** : fiche saisie « en extra-comptable (pour les anciennes
  acquisitions) », « N'oubliez pas de passer l'écriture comptable » (réc.
  p. 101 et 102 ; anc. p. 62), d'où l'état de rapprochement de p. 103.
- **Règle d'OmegaX** : une immobilisation naît avec son écriture
  d'acquisition (`Immobilisation.ecritureAcquisitionId`, obligatoire et
  unique) ; la reprise d'un bien ancien passe par `amortissementAnterieur`.
- **Texte** : aucun article ne l'impose ; c'est ce qui empêche l'écart que
  TOMPRO doit ensuite chercher. L'écart subsiste toutefois pour les écritures
  de classe 2 passées hors module : d'où P1-9.

### 4.16 RSF « base engagements » : contributions non reçues en ressources · Nouveau, vigilance

- **TOMPRO** : sur base engagements, « inclure dans les ressources les
  contributions non reçues et les dettes diminuées des créances » (réc.
  p. 120).
- **Règle d'OmegaX** : une promesse n'entre en créance que si elle est ferme,
  inconditionnelle et signée (`ConventionFinancement.caractere`,
  `ecritSigne`, contrôle `ENGAGEMENT_FERME_SANS_ECRIT_SIGNE`).
- **Texte relu** : SYCEBNL, cadre conceptuel **§ 5.4.2.4** (« comptabilisé
  dans les créances à recevoir [...] s'il correspond à un engagement ferme
  et inconditionnel et a fait l'objet d'un écrit signé »).
- **Nuance** : un RSF n'est pas un état comptable ; la contradiction ne naît
  que si l'état lit des « contributions non reçues » conditionnelles comme
  des ressources acquises. À respecter si P2-9 est construit.

### Récapitulatif

| # | Pratique | Pages | Verdict |
|---|---|---|---|
| 4.1 | Correction libre d'écritures validées | réc. 38, 40, 41 ; anc. 26, 28, 29 | Confirmé |
| 4.2 | Cours le plus proche | réc. 39, 48 | Confirmé |
| 4.3 | Cours moyen | réc. 13, 97, 117 ; anc. 59 | Confirmé, portée précisée |
| 4.4 | Frais bancaires dans le règlement | réc. 13, 39 | À nuancer |
| 4.5 | Revalidation forcée | TOMFED 11 | Confirmé |
| 4.6 | Budget par poste séparé | anc. 11, 12 ; réc. 20, 25, 79 | **Déclassé** |
| 4.7 | Purge | réc. 146, 147 ; anc. 82 | Confirmé |
| 4.8 | Amortissement au jour | réc. 103 | À nuancer, question ouverte |
| 4.9 | Évaluation isolée | réc. 102 ; anc. 62 | Confirmé |
| 4.10 | Compte de capitalisation | réc. 62 | Nouveau, confirmé |
| 4.11 | États paramétrés | réc. 106 à 111 ; anc. 65 à 68 | Nouveau, confirmé |
| 4.12 | Plan propre et passerelle | anc. 15 ; réc. 24, 63, 119 | Nouveau, confirmé |
| 4.13 | Libellés retouchés pour les mémoires | TOMFED 22, 23 | Nouveau, confirmé |
| 4.14 | Taux « des législations » | réc. 101 | Nouveau, à nuancer |
| 4.15 | Fiche extra-comptable | réc. 101 à 103 ; anc. 62 | Nouveau, sans texte |
| 4.16 | RSF base engagements | réc. 120 | Nouveau, vigilance |

---

## 5. Propositions d'amélioration

Chaque proposition dit sa source, ce qui existe déjà dans OmegaX, et la
règle de la section 4 à respecter. Les numéros de la lecture précédente
sont conservés ; les ajouts portent la mention « nouveau ».

### P1 · Usage quotidien

- **P1-1 · Alerte de pièce en double.** Source : « test sur numéro de
  pièce » (réc. p. 12). Existe : numérotation interne sans doublon
  (`journaux/numerotation-piece.ts`, `sequence-pieces.ts`). Manque : un
  avertissement quand la même `Ecriture.reference` revient pour le même
  tiers ou le même montant (double saisie d'une facture). Avertir, ne pas
  bloquer.
- **P1-2 · Section analytique par défaut par compte, avec forçage
  signalé.** Source : liaisons compte ↔ activité et compte ↔ poste,
  « l'utilisateur peut modifier ou forcer » (réc. p. 24 et 25, tableau
  p. 40). Existe : `Compte.bailleurId`, `PlanAnalytique.classesVentilees` et
  `ventilationObligatoire`. Manque : sections rattachées au compte, la
  première proposée à la saisie, l'écart signalé.
- **P1-3 · Clés de répartition a priori.** Source : réc. p. 68 et 69 ; anc.
  p. 40 et 41. Existe : la répartition a posteriori par OD analytique
  (`analytique/od-analytique.ts`) ; `ModeleSaisie` sans section. Manque :
  une clé (code, % par section, total 100) appelée à la saisie pour générer
  la ventilation.
- **P1-4 · Lignes budgétaires détaillées, avec le compte.** Source : ligne =
  compte × poste × convention × catégorie × géographie × activité, unité,
  prix unitaire × quantité, 6 modes de répartition (réc. p. 79 et 80 ; anc.
  p. 47 et 48). Existe : `BudgetSection` (annuel + 12 mois, répartition
  homogène sur les mois de la convention, retouche mensuelle ;
  `analytique.service.ts`). Manque : le détail de ligne, et surtout le
  **compte**, que le Guide SYCEBNL suppose (APPLICATION 22 (b), voir 4.6).
- **P1-5 · Versions de budget et réallocation.** Source : 10 budgets nommés
  (réc. p. 77 et 78), réallocation par duplication, coefficient et critère
  (p. 80 et 81), comparaison de deux budgets (p. 82) ; TOMFED p. 16. Existe :
  un seul budget par section et exercice ; `SimulationBudgetaire` (autre
  objet : hypothèses de variation par compte). Manque : budget initial
  conservé, budget révisé, écart entre les deux.
- **P1-6 · Suivi budgétaire mensuel et sur deux axes.** Source : analyse
  par période, bi-critères, situation mensuelle (réc. p. 83 à 87 ; anc.
  p. 49 à 51). Existe : état budgétaire prévu / réalisé / écart par plan et
  période (`etats-analytiques.service.ts`, `etatBudgetaire`), tableau
  d'exécution budgétaire. Manque : colonnes mois par mois, croisement de
  deux plans (projet × bailleur).
- **P1-7 · Tableau croisé à axes choisis.** Source : réc. p. 73, 82, 85 ;
  anc. p. 43, 48, 51. Existe : balance analytique par plan. Manque : lignes
  et colonnes au choix (plan, compte, rubrique), niveau de détail.
- **P1-8 · Journal à devise imposée et saisie en devise.** Source : « si la
  devise est fixe (exemple du compte spécial libellé en dollars) [...] ne
  sera pas modifiable » (réc. p. 28), saisie avec devise et cours (p. 38 et
  39) ; anc. p. 18. Existe : `LigneEcriture.deviseId`, `montantDevise`,
  `coursApplique`, `CoursDevise`. Manque : champ devise sur `Journal`, champs
  devise et cours dans `SaisiePage.tsx`. **Respecter 4.2** : cours du jour
  ou antérieur, jamais postérieur.
  *Note du 2026-09-28 (audit final)* · les champs devise, montant en devise
  et cours existent dans `SaisiePage.tsx` depuis le 2026-09-27 (audit final
  F49, vérifiés au serveur par `comptabilite/ligne-en-devise.ts`) ; reste le
  champ devise sur `Journal`, que le modèle ne porte toujours pas.
- **P1-9 · Écart fiches d'immobilisations / classe 2.** Source : état
  « Rapprochement avec la Comptabilité » (réc. p. 103). Existe : fiche née
  avec son écriture ; contrôles `PRODUCTION_IMMOBILISEE_SANS_IMMOBILISATION`,
  `DEPRECIATION_IMMO_HORS_MODULE`, `REEVALUATION_IMMO_HORS_MODULE`. Manque :
  un contrôle global « solde de chaque compte 2x contre valeur des fiches »,
  pour les écritures d'immobilisation passées hors module.

### P2 · Conformité bailleurs et états des projets

- **P2-1 · Catégories financières par convention.** Source : code du
  bailleur, option taxe, **seuil de pièces jointes**, modèle de DRF, lien
  aux postes (réc. p. 32) ; ventilation de co-financement à taux local et
  devise, 3 catégories au plus (p. 33) ; anc. p. 20 et 21. Existe :
  `ConventionFinancement` (montant accordé, tranches, rapports). Manque : les
  catégories et leur montant alloué, réalloué et daté (réc. p. 91 et 92).
- **P2-2 · DRF et paiements directs.** Source : anc. p. 55 à 59 ; réc. p. 93
  à 98. Existe : encaissement des tranches, rapports dus et contrôle
  `RAPPORT_BAILLEUR_NON_TRANSMIS`. Manque : tri des dépenses **payées** sur
  une période, indicateur facturable / non facturable, libellé de
  présentation **distinct** du libellé comptable (4.13), états avec et sans
  pièces jointes, marquage des pièces à la mise à jour, régularisation
  (payé, rejeté, litige, apuré), situation de la convention.
- **P2-3 · Devis-programmes UE.** Source : TOMFED p. 6 à 27. Existe :
  sections à période propre (`SectionAnalytique.dateDebut` / `dateFin`).
  Manque : DP comme **axe analytique** rattaché à la convention (4.5),
  type régie / engagement spécifique, caisse d'avance et son justificatif,
  mémoires.
- **P2-4 · Compte spécial.** Source : LACI 1E (avance, montant recouvré,
  dépenses éligibles, frais bancaires, produits financiers ; réc. p. 115),
  journal en devise du bailleur (p. 28 et 38). Existe : tableau de
  réconciliation de trésorerie, mais « Aucun modèle du logiciel ne désigne
  le compte spécial » et son repère E vaut zéro par construction
  (`etats-financiers-projet-budget.service.ts`, l. 299 et 378). Manque : la
  désignation du compte spécial.
- **P2-5 · Immobilisation rattachée au financement.** Source : « Les
  conventions et leurs hauteurs de financement », poste, activité,
  localisation (réc. p. 101 et 102 ; anc. p. 61 et 62). Existe : fiche riche,
  `LieuBien`. Manque : bailleur ou section et quote-part sur la fiche.
- **P2-6 · Enveloppe pluriannuelle (REP ou PAD).** Source : monnaie et cours
  du REP (réc. p. 12), REP par composante (p. 113 et 114), montant REP et
  révisé (p. 121) ; anc. p. 68 à 70. Existe : `montantAccorde` global de la
  convention ; budgets annuels. Manque : l'enveloppe sur la durée de vie, par
  section, et le cumul depuis l'origine.
- **P2-7 · Fiche de marché.** Source : réc. p. 124 à 132 ; anc. p. 71 à 78.
  Existe : `EngagementDepense` (bon de commande, contrat) et son exécution
  par rattachement d'écriture (SYCEBNL, APPLICATION 22 (d)). Manque : types
  de passation, schémas comptables (avance, retenue de garantie, pénalités),
  dates de réception, suivi facturation / règlement. Le compte 4017
  « Fournisseurs, retenues de garantie » est prévu par le SYCEBNL (fiche du
  compte 40).
- **P2-8 · Lettres de garantie.** Source : réc. p. 125, 127 et 128, 131 et
  132. Existe : rien. Lien au texte : SYCEBNL **art. 15**, les Notes annexes
  portent « le montant des engagements donnés et reçus dont le suivi doit
  être assuré par l'entité ».
- **P2-9 · Rapports financiers intérimaires (RSF).** Source : 5 modèles,
  base décaissements par défaut (réc. p. 120 et 121) ; LACI p. 112 à 118.
  Existe : états SYCEBNL des projets (emplois-ressources, exécution
  budgétaire, réconciliation) ; états personnalisés par comptes. Manque :
  modèles de rapport par bailleur, lignes par section ou catégorie.
  **Respecter 4.11 et 4.16.**
- **P2-10 · États sur base des décaissements.** Source : « toute sortie de
  fonds à travers les journaux de trésorerie » (réc. p. 135 à 142 ; TOMFED
  p. 18). Existe : colonne Décaissement du tableau d'exécution, par la
  formule de l'APPLICATION 22 (c). Manque : grand livre et analyses des
  décaissements par section et période.
- **P2-11 · Monnaies de suivi par convention (nouveau).** Source : deux
  monnaies de suivi et une monnaie d'émission (réc. p. 31 et 32 ; TOMFED
  p. 5). Existe : balance en monnaie fonctionnelle. Manque : montants alloués
  et consommés dans la monnaie du bailleur. **Respecter 4.3** : un rapport au
  bailleur, pas un bilan converti.

### P3 · Confort

- **P3-1 · Sens par défaut par compte** selon journal de prise en charge ou
  de trésorerie (réc. p. 26). Existe : inverseur de sens dans
  `SaisiePage.tsx`.
- **P3-2 · Comportement obligatoire contrôlé à la validation** (réc. p. 26).
  Existe : contrôle `CAISSE_CREDITRICE`, a posteriori. Manque : l'alerte au
  moment de valider.
- **P3-3 · Prélettrage pour échéancier et balance âgée** (réc. p. 47 et 48).
  Existe : lettrage PARTIEL (CPCC), échéancier, balance âgée. Reste :
  vérifier l'équivalence d'usage, rien à construire a priori.
- **P3-4 · Lettrage automatique par numéro de pièce et couple de journaux**
  (réc. p. 47). Existe : `OrigineLettrage.AUTOMATIQUE_PIECE`. Manque : le
  filtre par journaux, à vérifier.
- **P3-5 · Historique des mouvements extra-comptables** (numéro du relevé de
  rapprochement, réc. p. 44). Existe : `LigneReleveBancaire`,
  correspondances.
- **P3-6 · Duplication des comptes auxiliaires d'un tiers** vers un autre
  collectif (réc. p. 27). Existe : `TiersCompte` (plusieurs comptes par
  tiers). Manque : la copie en un geste.
- **P3-7 · Échéance « 30 jours le 15 »** (réc. p. 27). Existe :
  `ModeleReglement` (`delaiJours`, `NET` ou `FIN_DE_MOIS`). Manque : le jour
  de paiement.
- **P3-8 · Affectations successives d'un bien** avec date et motif (réc.
  p. 102). Existe : `LieuBien` (lieu courant seulement).
- **P3-9 · Numérotation des immobilisations par site et année** (réc.
  p. 12). Existe : `numeroInventaire` libre.
- **P3-10 · Double libellé** pour les bailleurs anglophones (réc. p. 13,
  151). Existe : rien.
- **P3-11 · Statistiques de saisie** par utilisateur, journal, site (réc.
  p. 150 et 151). Existe : `JournalAuditPage.tsx`, `PalmaresJournauxPage.tsx`.
- **P3-12 · Tableau de bord à colonnes et formules** (budgets, engagements,
  comptabilisé, décaissé ; réc. p. 141 et 142). Existe : états personnalisés
  par racines de comptes et formules de total
  (`etats-personnalises/moteur-etat-personnalise.ts`). Manque : colonnes
  budget et engagement.
- **P3-13 · Budget de trésorerie prévisionnel** alimenté par les budgets et
  les schémas de décaissement des marchés (réc. p. 124, 135, 142 ; anc.
  p. 72). Existe : rien d'équivalent.
- **P3-14 · Récapitulatif sur 5 ans** avec colonne « cumul années
  antérieures » (réc. p. 73, 86, 140). Existe : comparatifs N / N-1.
- **P3-15 · Recherche multicritère élargie (nouveau).** Source : par
  utilisateur, date de saisie, avec / sans analytique, avec / sans marché,
  résultat en balance, export texte (réc. p. 54 et 55). Existe :
  `comptabilite/recherche-ecritures.ts` (texte, compte, montants, pièce,
  référence).

### Ordre suggéré

P1-2 et P1-3 d'abord (ils rendent la ventilation, donc tout le reste,
praticable), puis P1-4 et P1-5 (le budget que le Guide SYCEBNL suppose),
puis P2-1 et P2-2 (le circuit bailleur, qui est la raison d'être de TOMPRO).
Avant P1-8, relire 4.2 ; avant P2-2 et P2-9, relire 4.11, 4.13 et 4.16. La
question 4.8 est à poser à Manasse avant toute retouche du prorata.

---

## 6. Ce qui reste non lu

- **Les captures d'écran** des trois documents (176 figures numérotées dans
  le manuel récent, écrans non numérotés dans l'ancien et dans TOMFED) :
  l'outil ne rend que la couche texte. Les champs visibles seulement à
  l'écran sont inconnus.
- **Aucune page de texte** : TOMFED 1 à 27, ancien manuel 1 à 87 et manuel
  récent 1 à 153 sont couverts, par les fichiers complets puis les morceaux.
- **Hors de ce dossier** : les manuels TOMCONSO et TECPRO cités par le
  manuel récent (p. 148 et 149), et les modèles officiels RSF de la Banque
  mondiale, dont le manuel ne donne que la structure.
- **Côté OmegaX**, les propositions disent ce qui existe d'après le code lu ;
  trois points restent à vérifier par exécution : le filtre par journaux du
  lettrage automatique (P3-4), l'équivalence prélettrage / lettrage partiel
  (P3-3), et le comportement exact de la répartition mensuelle du budget sur
  une convention à cheval sur deux exercices (P1-4).
