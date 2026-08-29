# Ce que Sage a et qu'OmegaX n'a pas · rapport d'écart

29 août 2026. Confrontation des manuels et guides Sage du Drive au logiciel tel
qu'il est aujourd'hui. Le rapport dit trois choses : ce qui est déjà repris,
ce qui manque et vaut la peine d'être construit, et ce qui est écarté
volontairement parce que Sage répond à un contexte qui n'est pas le nôtre.

## Méthode

La règle appliquée depuis le début de ce chantier vaut ici aussi : **un
mécanisme Sage n'est retenu que s'il apporte une valeur réelle à une entité à
but non lucratif congolaise**. Sage est un point de comparaison, pas une
prescription. Les manuels servent à éviter de deviner ; le SYCEBNL et le
contexte RDC décident.

Sources confrontées : le skill `sage-i7` (transcription des dix-neuf documents
du Drive) et, pour le parcours d'ouverture et le paramétrage d'un dossier
réel, le manuel Sage 100 i7 écrit pour l'ONG « Enfants Du Monde », qui est la
pièce la plus utile du lot parce qu'elle montre ce qu'une association retient
effectivement d'un logiciel conçu pour des entreprises.

---

## 1. Ce qui est déjà repris, et fidèlement

| Mécanisme Sage | État dans OmegaX |
|---|---|
| Comptes Détail vs Total, regroupement par racine de numéro | Fait (`TypeCompteDetailTotal`, agrégation par préfixe) |
| Longueur de compte paramétrable par dossier | Fait (`Tenant.longueurCompte`, 3 à 13) |
| Report à nouveau à trois modes (Aucun / Solde / Détail) | Fait (`ModeReportANouveau`) |
| Cinq types de journaux, Situation compris | Fait (`TypeJournal`) |
| Quatre modes de numérotation des pièces | Fait (`NumerotationPiece`) |
| Clôture à trois granularités (partielle, totale, période) | Fait (`clorePartielle`, `cloreTotale`, `clorePeriode`) |
| Lettrage manuel, automatique et délettrage | Fait |
| Rapprochement bancaire manuel, pointage et dépointage | Fait |
| Brouillard et validation des écritures | Fait, avec la règle de centralisation hebdomadaire du SYCEBNL |
| Taux de taxe comme entité à part entière, comptes rattachés | Fait |
| Régularisation des charges et produits, écritures d'abonnement | Fait |
| Réévaluation des créances et dettes en devise | Fait |
| Rappels et relevés, niveaux de relance paramétrables | Fait |
| Comptabilité analytique multi-axes, sections Détail/Total, budgets | Fait, axes Projets et Bailleurs |
| Import de plan de comptes, de balance et d'écritures | Fait |
| Contrôle de caisse | Fait, avec identification du premier jour négatif |
| Mise en sommeil d'un compte | Fait (`estActif`) |
| Barre de menus, barre d'outils, barre d'état, fenêtre par fenêtre | Fait |
| Assistant de création de fichier comptable | Fait, enrichi du choix de référentiel |
| Porte d'entrée avant identification, favoris des dossiers | Fait le 29 août 2026 |

---

## 2. Ce qui manque et qui vaut la peine

Classé par valeur décroissante **pour une ASBL ou une ONG congolaise**, pas
par facilité de construction.

### 2.1 Échéancier de trésorerie (Sage : « état de suivi des échéances à venir, distinct de la balance âgée »)

OmegaX a la balance âgée, qui regarde en arrière (ce qui est en retard). Il n'a
pas l'échéancier, qui regarde en avant (ce qui va tomber). Or `LigneEcriture`
porte déjà `dateEcheance`, alimentée pour les notes annexes : la donnée est là,
il manque l'état.

**Pourquoi c'est le premier de la liste.** Une association vit sur des
tranches de subvention et des cotisations appelées. Savoir ce qu'elle doit
payer les huit prochaines semaines et ce qu'elle doit encaisser est la
question que se pose son trésorier chaque mois. C'est aussi ce qui manque pour
répondre à un bailleur qui demande un plan de trésorerie.

### 2.2 Code taxe par défaut sur le compte

Chez Sage, un compte de charge ou de produit porte un code taxe proposé
automatiquement en saisie. OmegaX demande le taux à chaque ligne.

Petit mécanisme, gros effet sur le nombre d'erreurs de TVA. Un champ
`tauxTvaDefautId` sur `Compte` et une pré-sélection dans la grille de saisie.

### 2.3 Registre des retenues à la source

Rien de tel n'existe chez Sage France, et c'est justement le point : le besoin
vient du contexte congolais, pas du logiciel de référence. Une ASBL exonérée
d'impôt sur les sociétés reste redevable de tout ce qu'elle retient pour
autrui (IRPP salarial, retenue locative, 14 % sur prestataires non-résidents).
Voir `docs/fiscalite-asbl-rdc.md`, section 6.

Le modèle existe déjà : le registre de TVA. Il s'agit de le décliner sur les
comptes 44.

### 2.4 Échéancier fiscal et social du dossier

Même origine. Les dates de reversement (le 15, le 10, le 25) sont dans la note
de recherche ; elles doivent être **paramétrables** et rappelées au tableau de
bord, jamais figées dans le code (les échéances d'acomptes ont changé avec la
loi de finances 2026).

### 2.5 Rapprochement bancaire automatique et import du relevé

Sage réconcilie par tolérance de montant et importe l'extrait avant
réconciliation. OmegaX pointe à la main. L'import générique existe déjà
(`ImportService`), il manque un type `RELEVE_BANCAIRE` et l'appariement.

Utile dès qu'un dossier dépasse quelques dizaines de mouvements par mois.

### 2.6 Règlement des tiers en masse

Génération d'ordres de paiement groupés, regroupement multi-factures par
tiers, le règlement n'étant effectif qu'après impression de la lettre de
règlement. Ce dernier point est un vrai contrôle interne, et il est
transposable tel quel.

Pertinent pour une ONG qui paie trente fournisseurs le même jour en fin de
tranche budgétaire.

### 2.7 Pré-lettrage

Rapprochement provisoire avant lettrage définitif. Utile quand deux personnes
travaillent sur le même compte de tiers : l'une propose, l'autre confirme.
Faible coût, s'appuie sur le lettrage existant.

### 2.8 Amortissement dégressif et gestion des composants

`ModeAmortissement` ne connaît que `LINEAIRE`. Le SYCEBNL admet la
décomposition des immobilisations (Partie 2, ch. 3, règles générales de la
classe 2), et l'arrêté RDC n° 013/2025 fixe les durées fiscales. Les
composants comptent surtout pour un bâtiment, cas fréquent chez une
congrégation ou une fondation propriétaire.

L'amortissement dérogatoire (écart entre fiscal et comptable) est en revanche
à reporter : sans impôt sur les sociétés dû, il n'a pas d'objet pour une ASBL
exonérée.

### 2.9 Comparatif multi-exercices libre

Les états financiers portent la colonne N-1, ce qui est l'obligation légale.
Sage offre en plus un comparatif libre sur plusieurs exercices, par compte.
C'est ce que demande un bailleur qui finance sur trois ans.

### 2.10 Palmarès des comptes et analyse des journaux

Deux états du catalogue Sage, peu coûteux à produire depuis la balance
existante, et qui rendent service à la relecture d'un exercice : quels comptes
pèsent le plus, quel journal porte quel volume.

---

## 3. Ce qui est écarté, et pourquoi

Écarter n'est pas oublier. Chacun de ces points a été lu dans les manuels puis
laissé de côté pour une raison qui tient au contexte.

| Mécanisme Sage | Raison de l'écart |
|---|---|
| Module Moyens de Paiement : LCR, SEPA, lots bancaires, canaux de télétransmission | SEPA et LCR n'existent pas en RDC. Le besoin réel local est le mobile money, qui a son compte au plan SYCEBNL (55 Instruments de monnaie électronique) et relève d'une autre construction |
| Type de taxe TVA/CEE (échanges intracommunautaires) | Sans objet hors Union européenne |
| Amortissement dérogatoire | Suppose un écart fiscal/comptable qu'une ASBL exonérée d'IS n'a pas. À rouvrir si le logiciel sert un jour des entités lucratives |
| Plan IFRS natif et journaux réservés IFRS | Hors périmètre SYCEBNL. Une EBNL congolaise n'établit pas de comptes IFRS |
| Compte reporting (consolidation groupe) | Suppose un module multi-entités qui n'existe pas |
| Module Édition Pilotée complet (Vue Interactive, Simulateur, cubes) | Disproportionné. La partie utile (catalogue d'états, tableau de bord) est déjà couverte autrement |
| Sage Paie et RH | Un module de paie congolais est un projet à part entière : Code du travail, barème IRPP, CNSS, INPP, ONEM, déclaration unifiée. Le mentionner en écart serait malhonnête, c'est un autre logiciel |
| Sage X3 et son RBAC multi-couches | Hors périmètre structurel |

---

## 4. Ce que les manuels Sage ne couvrent pas, et qui manque quand même

C'est la partie que la confrontation au Drive ne peut pas produire : les
besoins que le SYCEBNL crée et que Sage France ignore.

### 4.1 Tableau emplois-ressources, exécution budgétaire, réconciliation de trésorerie

Trois des cinq états du jeu « projets de développement » (art. 14, point 2)
ne sont pas construits, et le livre d'inventaire le déclare. Le motif est
documenté dans `etats-financiers-projet.service.ts` : le texte officiel ne
fournit **aucun tableau de correspondance poste vers comptes** pour ces
tableaux, contrairement au bilan et au compte d'exploitation. Les construire
exigerait d'inventer le rattachement.

Ce qui manque n'est donc pas du code, c'est une source. À rouvrir dès qu'une
note officielle la fournit, ou sur la base d'un jeu d'états réel fourni par un
bailleur.

### 4.2 Le tableau d'exécution budgétaire, spécifiquement

Il suppose une nomenclature budgétaire propre au projet, distincte du plan de
comptes. La brique budgétaire analytique existe désormais (`BudgetSection`),
ce qui rapproche cet état de la faisabilité : c'est le premier des trois à
reprendre.

### 4.3 Suivi des conventions de financement

`SectionAnalytique` porte déjà `bailleurId`, `dateDebut` et `dateFin` de
convention. Il manque l'objet « convention » lui-même : montant accordé,
tranches, conditions de décaissement, rapports dus. Une ONG qui gère six
bailleurs tient ça dans un tableur aujourd'hui.

### 4.4 Contributions volontaires en nature, classe 9

Les comptes 900 à 914 existent au plan. Le contrôle qui les recense existe.
Il manque la saisie assistée : un bénévolat, un don en nature, un prêt à usage
se comptabilisent hors bilan et hors résultat, et personne ne le fait
spontanément juste.

### 4.5 Registre des donateurs

Construit (art. 17 et 18). Ce qui manque est l'attestation de don à remettre
au donateur, pièce que toute association congolaise établit à la main.

---

## 5. Ordre proposé

Si l'on ne devait retenir que cinq chantiers, dans cet ordre :

1. **Échéancier de trésorerie** (2.1) · la donnée existe, le besoin est
   quotidien, le coût est faible.
2. **Registre des retenues à la source et échéancier fiscal** (2.3 et 2.4) ·
   c'est ce qui expose réellement une ASBL congolaise, et rien ne le couvre.
3. **Code taxe par défaut sur le compte** (2.2) · une heure de travail, des
   erreurs de TVA en moins tous les jours.
4. **Tableau d'exécution budgétaire** (4.2) · le seul des trois états manquants
   qui soit désormais à portée, et celui que les bailleurs réclament.
5. **Rapprochement bancaire automatique avec import du relevé** (2.5) · le
   pas suivant dès qu'un dossier grossit.

Les points 2.6 à 2.10 et 4.3 à 4.5 viennent après, sans urgence.
