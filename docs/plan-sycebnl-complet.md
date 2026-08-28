# Plan de complétude SYCEBNL — inventaire exhaustif

> Établi le 2026-08-28 après dépouillement intégral du référentiel encodé dans le skill
> `sycebnl` (633 Ko : Acte uniforme art. 1-28, Partie 1 cadre conceptuel et glossaire,
> Partie 2 plan et fonctionnement des comptes, Partie 3 opérations spécifiques, Partie 4
> états financiers ch. 1-4, Guide d'application 22 cas chiffrés, note circulaire RDC
> 003/2013).
>
> **Ce document remplace l'item 15 de `plan-de-construction.md`** comme feuille de route
> SYCEBNL. L'item 15 mélangeait la complétude SYCEBNL avec des chantiers d'une autre nature
> (SYSCOHADA Phase 3, Paie, RBAC) : ceux-là restent dans le plan d'origine, hors de ce
> document.
>
> Règle §2.6 inchangée : chaque ligne ci-dessous est ancrée à un article ou à une section du
> texte officiel. Aucune n'est écrite de mémoire.

---

## 0. Ce qui est déjà livré et audité

| Brique | État |
|---|---|
| Moteur comptable (écritures, journaux, lettrage, rapprochement, immobilisations, TVA, clôture et report à-nouveau) | ✅ |
| Bilan + Compte de résultat, jeu associations (Partie 4 ch. 2) | ✅ audité ligne à ligne |
| Bilan + Compte d'exploitation, jeu projets (Partie 4 ch. 3) | ✅ audité ligne à ligne |
| Note 9 « Fonds du bailleur » + comptabilité analytique par bailleur | ✅ |

Soit **4 états de synthèse sur 11**, et **1 tableau de notes sur 76**.

### Confirmation apportée par le dépouillement

L'**article 7** de l'Acte uniforme dispose que le compte d'exploitation des projets
« récapitule les charges **sans amortissement, ni dépréciation** », et l'**article 11** en dit
autant du tableau emplois-ressources. Cela confirme en droit la correction faite à l'audit du
même jour (retrait des colonnes Brut/Amortissement du bilan projet, qui avaient été recopiées
à tort du jeu associations).

### Correction d'une affirmation antérieure

Le premier inventaire (artefact « Complétude SYCEBNL », publié quelques heures plus tôt)
affirmait que le texte ne fournissait **aucun** tableau de correspondance pour le tableau
emplois-ressources ni pour le tableau d'exécution budgétaire, et classait ces états comme
« bloqués, rattachement à inventer ». **C'est faux.** Le Guide d'application officiel les
donne, en son chapitre 7 : **Application 21** pour le tableau emplois-ressources (poste par
poste, avec 8 renvois d'ajustement) et **Application 22** pour le tableau d'exécution
budgétaire. Les deux états redeviennent constructibles sur base officielle. Seul le
**tableau de réconciliation de trésorerie** reste sans correspondance.

---

## Convention de routage modèle / effort

Établie le 2026-08-28. Le couple modèle-effort est annoncé au début de chaque phase.

| Opération | Modèle | Effort |
|---|---|---|
| Dépouiller un référentiel, transcrire une table de correspondance officielle | Opus 5 | xhigh |
| Concevoir un moteur, une architecture, un modèle de données | Opus 5 | xhigh |
| Déboguer un symptôme dont la cause est inconnue | Opus 5 | xhigh |
| Rédiger un plan, une documentation de référence | Opus 5 | high |
| Transcrire des notes en lot — motif établi ET tests-gardes en place | Sonnet 5 | high |
| Corriger un bug identifié et localisé | Sonnet 5 | high |
| Frontend, écrans, rendu | Sonnet 5 | high |
| Wiring, CRUD, export Excel, écriture de tests | Sonnet 5 | medium |
| Audit adversarial d'un bloc livré | Fable 5 | xhigh |
| Audit complet du logiciel, en fin de module | Fable 5 | xhigh (ou max) |

**Condition impérative sur les lignes Sonnet 5** : le motif doit être établi et les tests-gardes
écrits. Sans ces deux conditions, on retombe dans la configuration exacte qui a produit les
erreurs de l'audit — colonnes Brut/Amortissement recopiées du mauvais jeu, compte 564 cité de
mémoire depuis le SYSCOHADA. Ce ne sont pas des échecs de raisonnement complexe mais des
relâchements de vigilance sur de la transcription.

**Granularité des bascules** : changer par PHASE, jamais par micro-tâche. Chaque changement de
modèle ou d'effort invalide le cache de contexte, dont la réutilisation représente l'essentiel
de l'économie sur une session longue.

**Ce qui compte plus que le modèle** : retourner au texte officiel ligne à ligne, et écrire des
tests-gardes structurels. Deux tests auraient suffi à attraper seuls les deux bugs de chiffres
de l'audit. Cette discipline fonctionne sur les trois modèles ; la sauter échoue sur les trois.

---

## Journal d'avancement

### Phase 1 engagée le 2026-08-28 — moteur de notes annexes

**Livré** : `src/modules/notes-annexes/` — types déclaratifs, résolveur, contrôleur,
fiche récapitulative, renvois croisés de l'art. 15, et les 5 premières notes du jeu
associations (7, 9, 11, 12, 13). 13 tests. Route `GET /notes-annexes/associations`.

La règle du **§ 1.4** est appliquée dans le moteur, pas dans l'affichage, pour qu'elle vaille
aussi à l'export : une note sans aucune rubrique chiffrée est déclarée non applicable et ne
présente rien ; dans une note applicable, les lignes à zéro sont retirées, les totaux
conservés. Vérifié en recoupant la Note 13 avec le poste BW du bilan — mêmes montants,
N et N-1.

**Découverte de conception, faite au premier pas et qui change la nature de la phase.**
Le texte ne fournit **aucun tableau de correspondance pour les notes** : elles n'énumèrent que
des libellés de rubriques. Pire, ces libellés réclament souvent une granularité que le plan de
comptes normalisé ne porte pas — la Note 24 « Achats » veut des lignes distinctes pour
« Matières consommables », « Produits d'entretien », « Eau », « Électricité », « Fourniture de
bureau », alors que le plan s'arrête au compte 604 sans subdivision. Et un rapprochement par
ressemblance de libellé serait pire que rien : « Matières consommables » existe bien au plan,
en compte **331**, qui est un compte de STOCK et non d'achat.

Conséquence tenue dans le moteur : une rubrique n'est rattachée que si le rattachement découle
**sans jugement** du plan normalisé. Sinon elle porte `subdivisionAttendue`, reste non
rattachée, et s'affiche en attente — jamais à zéro. Les notes de trésorerie (11, 12, 13) sont
intégralement rattachables, le plan y descendant au divisionnaire ; les notes de charges et de
produits demanderont un rattachement par dossier.

Cela ajoute un chantier à la phase 1, qui n'était pas au plan initial : **une couche de
rattachement des sous-comptes du dossier aux rubriques de notes**. Sans elle, une bonne part
des 45 notes du jeu associations resteront structurellement vides.

**Couche de rattachement — livrée.** Table `rattachements_notes`, unique par
(dossier, jeu, note, rubrique, compte). Garde-fou central : **seule** une rubrique portant
`subdivisionAttendue` est rattachable ; un rattachement sur une rubrique que le plan officiel
détermine est refusé explicitement, jamais ignoré — le permettre laisserait défaire en silence
la fidélité au texte. Les comptes rattachés **s'ajoutent** aux préfixes officiels, ils ne les
remplacent pas. Chaque rubrique rattachable porte une `cle` stable : s'ancrer sur le libellé
serait fragile, une correction de transcription faisant tomber tous les rattachements du
dossier. La fiche récapitulative porte les rubriques en attente **avec leur clé**, sans quoi
une note dont rien n'est encore chiffré (donc sans lignes, § 1.4) serait impossible à alimenter.

### Dépouillement des 45 notes par forme de tableau (2026-08-28)

Fait avant de lancer la transcription en lot, et qui en a changé l'ordre : le moteur ne
couvrait qu'une forme sur cinq.

| Famille | Forme | Notes | Nb |
|---|---|---|---|
| **A** | Année N / N-1 / variations | 8, 11, 12, 13, 16, 17B, 18B, 22, 23, 24, 25, 26, 27, 28, 29A, 31, 32 | 17 |
| **B** | + échéances 1 an / 2 ans / +2 ans | 6, 9, 10, 18A, 19, 20, 21 | 7 |
| **C** | ouverture / augmentations / diminutions / clôture | 5A, 5B, 5C, 5D, 5E, 5F, 30 | 7 |
| **D** | grilles sur mesure | 1, 5G, 14, 15, 17A | 5 |
| **E** | hors balance ou saisie | 2, 3, 4, 5H, 7, 29B, 33, 34, 35 | 9 |

**Famille C livrée.** `EcritureService.balance` scinde chaque ligne en *report à-nouveau*
(l'ouverture) et *mouvements propres de l'exercice*. Sans cette scission, `totalDebit` englobe
le report et un bâtiment détenu depuis 2020 serait présenté comme une acquisition de
l'exercice en colonne « AUGMENTATIONS B ». La clôture est **recalculée** (D = A + B − C, la
formule que le texte écrit lui-même) et l'écart avec le solde réel devient un contrôle offert
à l'utilisateur. Notes 5B, 5E, 5F transcrites.

**Famille B livrée.** `LigneEcriture.dateEcheance` — la ventilation ne se déduit d'aucun champ
existant. Bornes comptées depuis la clôture ; lignes lettrées exclues ; échéance transportée
par le report à-nouveau en mode Détail, sans quoi elle se viderait à chaque clôture. Ce qui
n'est pas ventilé est **dit** (`echeanceNonVentilee`) plutôt que rangé d'office en « à un an
au plus », qui donnerait une ventilation d'apparence complète et fausse.

**Reste en phase 1** : 36 notes du jeu associations (dont 22 relèvent des familles A/B/C
désormais outillées, donc mécaniques ; 5 de la famille D et 9 de la famille E demandent
chacune une forme propre), les 26 notes du jeu projets, l'export Excel et l'écran.

---

## A. États financiers restants (Partie 4)

### A1 — Tableau des flux de trésorerie, jeu associations
`ZA → ZG`, `FA → FQ` · Partie 4 ch. 2 section 3 · art. 10

Méthode **directe** : encaissements et décaissements classés par nature, pas un regroupement
de soldes. Suppose de remonter de chaque mouvement de trésorerie à sa contrepartie et de la
qualifier (cotisations, subventions, générosité, manifestations, fournisseurs, personnel,
acquisitions, cessions, emprunts).

Le moteur de référence du référentiel lui-même laisse la ventilation `FA`-`FH` en saisie
manuelle. **C'est le seul chantier où une automatisation totale n'est pas acquise d'avance**
— voir la décision D2 en fin de document.

### A2 — Notes annexes, jeu associations
45 tableaux distincts · Partie 4 ch. 2 section 4

Notes 1 à 35, dont 5A-5H, 17A/B, 18A/B, 29A/B. Plus la **fiche récapitulative**, qui déclare
pour chaque note si elle est applicable ou non — elle fait partie de la liasse.

L'art. 15 impose que les notes soient « organisées par une **référence croisée** avec
l'information liée » : chaque poste des états porte un renvoi de note, et réciproquement.

Environ 35 de ces tableaux partagent une même ossature (libellés en lignes ; colonnes Année N,
Année N-1, variation en valeur, variation en %). Une dizaine sortent du moule et demandent du
sur-mesure : 29B effectifs et masse salariale, 33 indicateurs financiers, 34 informations
sociales et environnementales, 1 engagements et contributions volontaires, 5G plus-values de
cession, 5H réévaluations.

### A3 — Notes annexes, jeu projets
25 tableaux restants sur 26 · Partie 4 ch. 3 section 6

Même moteur que A2. La Note 9 est livrée. La Note 24 est le tableau d'exécution budgétaire
(voir A6).

### A4 — Tableau emplois-ressources, jeu projets
`FA → GZ` · Partie 4 ch. 3 section 1 · art. 11 · **correspondance : Guide, Application 21**

Alimenté par les **mouvements** débit et crédit de la balance (que l'application calcule déjà),
et non par les soldes. Huit renvois d'ajustement précis à implémenter : déduction des
variations de dettes fournisseurs d'exploitation et d'investissement, des dettes fiscales, des
dettes de personnel ; neutralisation des virements de compte à compte, des livraisons à
soi-même, de la variation de stocks du compte 603, des intérêts courus du compte 276.

### A5 — Tableau de réconciliation de trésorerie, jeu projets
`A → I` · Partie 4 ch. 3 section 3 · art. 13

**Seul état du référentiel sans tableau de correspondance officiel.** Ses neuf repères ne sont
définis que par leur libellé. Le rattachement aux comptes devra être proposé, documenté comme
une proposition, et validé par un professionnel avant livraison — voir la décision D3.

### A6 — Tableau d'exécution budgétaire, jeu projets
Partie 4 ch. 3 section 2 · art. 12 · **correspondance : Guide, Application 22**
Sert aussi la Note 35 du jeu associations.

La règle (b) du Guide lève l'obstacle que je croyais rédhibitoire : « le plan comptable doit
être conçu en tenant compte du budget du projet ; cette rubrique est remplie au vu du budget de
l'exercice, **compte par compte** ». Le budget est donc porté **par compte**, pas par un
sous-système budgétaire complet.

- **Budget** : un montant par compte et par exercice. Modèle simple.
- **Décaissement** : calculable depuis la balance (règle (c), avec ses ajustements).
- **Engagement** : soldes créditeurs fournisseurs (calculable) **plus** les bons de commande
  non exécutés et les contrats signés non exécutés — ces deux-là sont des données hors
  comptabilité, à saisir.

### A7 — Système minimal de trésorerie
Partie 4 ch. 4 · art. 5-6

- **Détection d'éligibilité** : cinq natures de ressources, seuil de 30 000 000 FCFA chacune,
  plus la règle de cumul sur deux exercices. Calculable depuis les données existantes ; a de la
  valeur seule, en signalant à un dossier qu'il relève d'un autre régime.
- **Bilan SMT** `GA → HZ`
- **Compte de résultat SMT** `KA → KZC` — comptabilité de **trésorerie**, avec retraitement des
  variations de stocks, de créances, de dettes et des dotations aux amortissements. Logique
  franchement distincte des deux autres jeux.
- **5 notes** (suivi des immobilisations, stocks, créances et dettes non échues, journal unique
  de trésorerie, dotation) + fiche récapitulative.

### A8 — Conformité des règles de présentation
Partie 4 ch. 1 § 1.4

Deux règles s'appliquent aux états **déjà livrés** :

1. « Les rubriques et les postes des états financiers **non chiffrés ne doivent pas être
   présentés**. » L'application affiche aujourd'hui tous les postes, y compris à zéro (grisés à
   l'écran, mais présents à l'export). Non conforme pour la liasse éditée. La même règle vaut
   pour les lignes des notes.
2. « La **compensation** entre les postes d'actif et de passif ou entre des postes de charges et
   de produits n'est pas admise. » À exposer comme contrôle.

---

## B. Opérations spécifiques aux entités à but non lucratif (Partie 3 + Guide)

C'est le cœur métier propre au SYCEBNL, et ce qu'aucun logiciel généraliste ne porte. Chaque
ligne renvoie à son chapitre de la Partie 3 et, quand il existe, à son cas chiffré du Guide.

| # | Opération | Source | Comptes pivots |
|---|---|---|---|
| B1 | Fonds affectés à un projet spécifique — **dotation automatique à la clôture** de la quote-part non utilisée | P3 ch. 2 · §5.4.2.3 · App. 4 | 165, charge « Dotation fonds affectés non consommés » |
| B2 | Dons en nature à distribuer (courants et H.A.O.), stock de fin d'exercice | P3 ch. 4 §1 · App. 9 | 654, 7542, 832, 842 |
| B3 | Dons en nature à vendre (suivi extra-comptable) | P3 ch. 4 §2 · App. 10 | 7081, 172 |
| B4 | Dons en numéraire, legs, denier du culte, zakat, dîme, célébrations, mécénat, parrainage | P3 ch. 4 §3 · App. 11 | 704 |
| B5 | Frais de recherche de fonds | P3 ch. 4 §4 · App. 12 | 636 |
| B6 | Cotisations et droit d'entrée — **politique de fait générateur** (appel vs encaissement) | P3 ch. 5 §1 · §5.4.2.1 · App. 2, 13 | 701, 103, dépréciation 491 |
| B7 | Contribution du fondateur d'une fondation | P3 ch. 5 §2 · App. 14 | 752 |
| B8 | Subventions et aides financières **versées** par l'EBNL | P3 ch. 5 §3 · App. 15 | 652 |
| B9 | Subventions d'exploitation pluriannuelles — quote-part automatique | P3 ch. 6 §1 · §5.4.2.2 · App. 16 | 477, reprises |
| B10 | Abandons de frais engagés par les bénévoles | P3 ch. 6 §2 · App. 17 | 4572, 7583, 846 |
| B11 | Convention de mécénat | P3 ch. 6 §3 · App. 18 | 4751, 7046 |
| B12 | Restitution de subvention non utilisée | P3 ch. 6 §4 · App. 19 | 4739 |
| B13 | **Contributions volontaires en nature** — bénévolat, mises à disposition, prestations | P3 ch. 6 §5 · App. 20 | classe 9 (900-904 / 910-914) |
| B14 | Dotation consomptible et non consomptible, droit d'adhésion | P3 ch. 1 · App. 1 | 101-104 |
| B15 | Subventions d'investissement | P3 ch. 1 §2.5 · App. 3 | 14, reprise 79 |
| B16 | Dons et legs d'immobilisations à conserver | P3 ch. 2 §2.2 · App. 5 | 167, 4861, 192 |
| B17 | Legs et donations non encore reçus, destinés à la vente | P3 ch. 2 §2.2 · App. 6 | 171, 172 |
| B18 | Donation temporaire d'usufruit | P3 ch. 2 §2.3 · App. 7 | 2011, 171, 280, 7961 |
| B19 | Projets : décaissement bailleur, engagement, reprise de quote-part, décomptabilisation en fin de projet | P3 ch. 3 · App. 8 | 162-164, 462-464, 702 |
| B20 | **Promesses de financement** — ferme et écrite → créance ; conditionnelle → note annexe | §5.4.2.4 | créances / Note annexe |
| B21 | Première année d'application du SYCEBNL (reprise des soldes, transition) | P3 ch. 6 §6 | — |

**Note sur B13** : les sept comptes de classe 9 existent bien au plan de comptes livré
(900, 901, 902, 904, 910, 911, 914 — la liste complète du texte). Ce qui manque, c'est le
traitement : ces contributions sont **hors bilan et hors résultat**, et la Note 1 du jeu
associations les réclame.

**Note sur B6 et B20** : ce sont des **politiques comptables au niveau du dossier**, pas de
simples écritures. Le texte impose de préciser en notes annexes la méthode retenue pour les
cotisations. Le choix pilote à la fois les écritures et une mention obligatoire.

---

## C. Registres et documents obligatoires

| # | Obligation | Source | Enjeu |
|---|---|---|---|
| C1 | ✅ **Registre des donateurs** — coté, paraphé, numéroté en continu ; date, identité complète du donateur, montant et mode de libération ; signature du représentant légal ; version électronique expressément admise | art. 17-18 · P2 ch. 2 | **Sanction pénale** en cas de registre non tenu ou non mis à jour (art. 24) |
| C2 | **Livre d'inventaire** — transcription des états financiers de l'exercice et du résumé de l'opération d'inventaire | art. 14 · P2 ch. 2 | **Sanction pénale** (art. 24) |
| C3 | **Rapport d'activité** — situation de l'exercice écoulé, perspectives, évolution de la trésorerie, événements importants survenus après la clôture | art. 16-3 | **Sanction pénale** (art. 24) |
| C4 | **Correction d'erreur par inscription en négatif** — « toute correction d'erreur découverte sur l'exercice en cours s'effectue exclusivement par l'inscription en négatif des éléments erronés ; l'enregistrement exact est ensuite opéré » | art. 20 AUDCIF, via P2 ch. 2 | Les écritures sont déjà immuables dans l'application, mais **aucune fonction de contre-passation n'existe** |
| C5 | Centralisation des journaux auxiliaires **au moins chaque semaine** dans le livre-journal ou le grand-livre | P2 ch. 2 | Contrainte de périodicité si des journaux auxiliaires sont introduits |

**C1 réalisé** (`src/modules/registre-donateurs/`). Trois garanties tirées du texte, et non de
l'ergonomie :

- **numérotation continue** — le numéro est attribué par le serveur, jamais saisi, et la
  contrainte `@@unique([tenantId, numero])` arbitre les inscriptions concurrentes (rejeu sur
  P2002). Aucune route `DELETE` n'existe : effacer une ligne ouvrirait un trou dans une
  numérotation que l'art. 17 veut continue. Une erreur s'**annule** avec motif en gardant son
  numéro, comme une écriture se contre-passe ;
- **mentions manquantes signalées, jamais bloquantes** — l'art. 18 organise expressément un
  rapport « sur sa tenue conforme », donc un registre dont la conformité se constate a
  posteriori ; et l'art. 24 sanctionne le *défaut de tenue*. Refuser un don réel parce que
  l'adresse électronique du donateur est inconnue pousserait à ne l'inscrire nulle part, ce qui
  est l'infraction elle-même. Seules les **incohérences** sont refusées (un NIF sur une personne
  physique mélange les points 2 et 3 de l'art. 17) ;
- **rapprochement avec la comptabilité** (`correspondance-registre.ts`) — aucun tableau de
  correspondance officiel n'existe pour ce rapprochement : le périmètre est construit compte par
  compte, chaque entrée portant sa citation. Deux points de méthode y sont décisifs :
  - les dons en nature (7542, 8415) et les fonds de dons et legs d'immobilisations (167, 171)
    se lisent **au crédit seul**. Lus en net, l'extourne de clôture des dons non consommés
    (P3 ch. 4 § 1.2) amputerait le total comptable et accuserait le registre d'un manquement
    inexistant ;
  - le **parrainage (7047)** et les **célébrations (7045)** sont chiffrés mais **jamais agrégés**.
    Le plan les range sous « Revenus liés à la générosité » alors que le parrainage est défini
    « en vue d'en retirer un bénéfice direct », ce qui contredit le « sans contrepartie » de la
    définition de la donation. Le texte ne tranche pas : le rapport expose les deux lectures avec
    leurs citations et laisse le dossier décider (règle §2.6).

---

## D. Contrôle, révision et conformité

Ce bloc est le différenciateur principal : le référentiel embarque ses propres règles de
vérification, qu'aucun logiciel n'expose aujourd'hui.

### D1 — Moteur de contrôles par compte
**76 blocs « Éléments de contrôle »** dans la Partie 2 ch. 3, un par compte divisionnaire. Ils
énumèrent les **pièces justificatives attendues** pour vérifier chaque compte. Exemples
littéraux :

- compte 52 Banques : « relevés bancaires ; états de rapprochement bancaire »
- compte 66 Charges de personnel : « livres de paie ; fiches de paie ; déclarations sociales et fiscales »
- compte 41 Clients-usagers : « appels de cotisations, factures, chèques de règlement, relances, dossiers contentieux »

Transformés en **dossier de révision** : à la clôture, pour chaque compte mouvementé, la liste
des pièces que le texte attend, cochables, avec pièce jointe. C'est exactement ce qu'un
expert-comptable prépare à la main.

### D2 — Contrôles d'imputation à la saisie
**70 blocs « Exclusions »**, qui disent ce qu'un compte **ne doit pas** enregistrer **et donnent
le compte correct**. Exemple littéral, compte 66 : les honoraires versés à des tiers n'y ont pas
leur place, « il convient d'utiliser le compte 632 — Rémunérations d'intermédiaires et de
conseils ».

Exploitables en avertissement contextuel à la saisie, avec le compte de renvoi proposé. Aucun
logiciel comptable ne fait cela.

### D3 — Seuils de désignation d'un auditeur
art. 19-22. Trois critères alternatifs à la clôture : total de bilan > 100 000 000 FCFA,
ressources annuelles > 200 000 000 FCFA, effectif permanent > 20 personnes. Sortie de
l'obligation seulement après deux exercices sans aucun critère rempli. Mandat de trois exercices
renouvelable une fois. **États financiers à transmettre à l'auditeur 45 jours avant l'assemblée.**
Sanction pénale si la désignation n'est pas provoquée (art. 25).

### D4 — Seuils d'éligibilité au SMT
art. 6, voir A7.

### D5 — Événements postérieurs à la clôture
art. 7 (« il doit être tenu compte des risques, charges et produits… même s'ils sont connus
seulement entre la date de clôture et celle de l'arrêté des comptes ») et art. 16-3. Alimente la
Note 3 du jeu associations.

### D6 — Changements de méthodes, d'estimations, corrections d'erreurs
Partie 1 ch. 2 (postulat de permanence des méthodes) et § 1.4 de la Partie 4 (« toute
modification dans la présentation ou dans les méthodes d'évaluation doit être signalée dans les
Notes annexes »). Alimente la Note 4.

### D7 — Contrôle de non-compensation
Voir A8-2.

---

## E. Aide à la mise en œuvre

| # | Élément | Source |
|---|---|---|
| E1 | **Écritures-types** dérivées des 22 applications chiffrées du Guide — modèles de saisie guidés, couvrant B1 à B21 | Guide, App. 1-20 |
| E2 | Checklist de constitution d'une ASBL/EUP en RDC (pièces requises, facilités administratives, fiscales et douanières) | Note circulaire 003/CAB/MIN/PL.SMRM/COFAF/2013 |
| E3 | Glossaire métier intégré — 40+ termes définis officiellement (commodat, denier du culte, dotation consomptible, fonds dédiés, waqf, zakat…) | Partie 1 ch. 1 |

---

## Séquencement

L'ordre suit les dépendances réelles et la valeur livrée à chaque palier. Chaque phase se termine
sur quelque chose d'utilisable, jamais sur un demi-état.

| Phase | Contenu | Ce que ça débloque |
|---|---|---|
| **1** | Moteur de notes déclaratif + fiche récapitulative + renvois croisés (art. 15) + conformité §1.4 — puis A2 et A3 | **70 des 76 tableaux de notes** |
| **2** | A1 — Tableau des flux de trésorerie | **Liasse associations complète et déposable** |
| **3** | C1 à C4 — registres légaux et contre-passation | Conformité aux art. 14, 16, 17, 18, 20 — les postes sous sanction pénale |
| **4** | B1 à B21 + E1 — opérations spécifiques et écritures-types | L'usage quotidien réel d'une EBNL |
| **5** | D1 et D2 — moteur de contrôles du référentiel | Le différenciateur : révision assistée et imputation guidée |
| **6** | A4, A6 puis A5 — états projets restants | **Liasse projets complète** |
| **7** | A7 — Système minimal de trésorerie | Le segment des petites entités |
| **8** | D3 à D7, E2, E3 — veille de seuils, événements, méthodes, aides | Le rôle de conseil |

---

## Décisions à trancher avant d'engager

**D1 — Le degré d'automatisation du tableau de flux de trésorerie.**
Entre une ventilation entièrement déduite des écritures et une saisie assistée, il y a un
continuum ; le moteur de référence du référentiel s'arrête à l'assistance. Automatisation
complète = plus long, et c'est le vrai différenciateur. Assistance d'abord = l'état sort tout de
suite.

**D2 — La profondeur de la brique budgétaire.**
Le Guide (App. 22) montre qu'un budget **par compte** suffit pour l'essentiel du tableau
d'exécution budgétaire. Restent les bons de commande et contrats non exécutés, hors comptabilité.
Les saisir aussi, ou livrer le tableau avec la seule colonne Engagement issue des soldes
fournisseurs, en signalant la limite ?

**D3 — Le tableau de réconciliation de trésorerie.**
Aucune correspondance officielle. Proposer un rattachement documenté et le faire valider par un
professionnel, ou s'en tenir aux états dotés d'une correspondance officielle et déclarer celui-ci
hors périmètre ?

---

## Ce qui reste hors de ce document

Les chantiers de l'item 15 du plan d'origine qui ne relèvent pas du SYCEBNL : Trésorerie avancée
(lots, LCR/virements), Stocks, SYSCOHADA Phase 3, OHADA→IFRS, Paie, RBAC fin. Ils gardent leur
place dans `plan-de-construction.md`.
