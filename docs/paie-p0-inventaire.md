# Paie · P0, lecture et inventaire

Passe de LECTURE, menée le 2026-09-19. **Rien n'est codé ici** : le but est de
savoir ce que les textes imposent, ce qu'ils laissent à l'entité, et ce qui
manque, avant qu'une seule ligne de calcul de bulletin ne soit écrite.

---

## 0. Ce que cette passe a corrigé de mon propre plan

Trois affirmations du plan présenté avant P0 étaient fausses ou approximatives.
Elles sont rectifiées ici plutôt que laissées derrière.

1. **« L'INPP est absent du corpus »** · FAUX. Le dépôt le porte déjà, avec son
   arrêté et ses quatre tranches d'effectif (`correspondance-retenues.ts`, clé
   `inpp`), et le semis SYCEBNL lui ouvre un compte. Ce qui est vrai est plus
   étroit et plus gênant : **l'arrêté n'est dans AUCUNE compétence**, il n'est
   cité que par le dépôt lui-même. Le taux est donc invérifiable contre un
   texte lu.
2. **« Chercher le plafond d'assiette CNSS »** · il n'y en a pas. Le décret
   n° 18/041 pose l'inverse, un PLANCHER : « en aucun cas, le montant des
   rémunérations servant de base de calcul des cotisations ne peut être
   inférieur au salaire minimum interprofessionnel garanti » (art. 8). Ce qui
   rend le manque du SMIG bloquant plutôt qu'anecdotique.
3. **« Le module de paie n'existe pas »** · la moitié déclarative existe, et
   elle est plus complète que je ne le disais : le registre des retenues porte
   déjà la CNSS, l'INPP et l'ONEM avec leurs taux, leurs bases légales, leurs
   échéances et leurs sanctions, ainsi que l'IRPP salarial et son imprimé.

---

## 1. Les sources lues, et ce qu'elles valent

| Source | Portée |
|---|---|
| Code du travail, **Titre V (du salaire)**, texte verbatim | Chapitres I à VII. Détermination, mode de paiement, maladie, privilèges, **retenues (ch. V)**, **saisie et cessions (ch. VI)**, économats. |
| Code du travail, art. 139 | Renvoie à un ARRÊTÉ pour la valeur forfaitaire du logement. |
| Décret n° 18/041 du 24/11/2018 | Taux CNSS et plancher au SMIG. |
| Arrêté n° 146/2018, art. 17 à 41 | **Assiette** des cotisations, calcul, déclaration, versement. |
| Arrêté n° 028/CAB/MIN.ET/2025 | ONEM, 0,5 % depuis le 25/09/2025 (0,2 % avant). |
| `parametres-2026.md` (fiscalite-rdc-socle) | **Barème IRPP art. 118**, corroboré par la page DGI. |
| CPCC, ch. 5 « La paie et les charges sociales » | Organisation du service, pièces justificatives, supports. |
| CPCC, « Calcul et comptabilisation du décompte final » | Méthode complète du décompte final, barèmes de préavis, écritures. |

**LE DERNIER EST LE PLUS RICHE ET LE PLUS DATÉ, et c'est le piège de cette
passe.** Voir § 4.

---

## 2. Ce que les textes imposent, et qui est calculable

### 2.1 L'assiette des cotisations sociales n'est PAS l'assiette fiscale

Arrêté n° 146/2018, art. 17. La rémunération soumise à cotisation comprend
salaire, commissions, indemnité de vie chère, primes, participation aux
bénéfices, gratifications et mois complémentaires, prestations
supplémentaires, **valeur des avantages en nature**, allocation ou indemnité
compensatoire de congé, et les sommes payées pendant l'incapacité et autour de
l'accouchement.

**NE SONT PAS des éléments de la rémunération** : les soins de santé,
**l'indemnité de logement ou le logement en nature**, les allocations
familiales légales, **l'indemnité de transport**, les frais de voyage, et les
avantages accordés exclusivement pour faciliter l'accomplissement des
fonctions.

Conséquence pour le moteur : **un bulletin porte AU MOINS DEUX BASES**, et les
confondre est une erreur qui ne se voit nulle part. Le logement est dans
l'assiette fiscale et hors de l'assiette sociale.

### 2.2 Les taux, chacun avec sa charge

| Prélèvement | Taux | À la charge de | Source |
|---|---|---|---|
| CNSS · prestations aux familles | 6,5 % | employeur seul | décret 18/041, art. 2 |
| CNSS · pensions | 10 % | **5 % employeur + 5 % travailleur** | art. 3 |
| CNSS · risques professionnels | 1,5 % | employeur seul, **doublable** en cas de non-conformité | art. 4 et 5 |
| INPP | 4 % public · 3,5 % (1 à 50) · 3 % (51 à 300) · 2 % (> 300) | employeur | arrêté 002/CAB/MET/2025 · **hors corpus** |
| ONEM | 0,5 % depuis le 25/09/2025, 0,2 % avant | employeur | arrêté 028/2025, art. 1er |
| IRPP salarial | barème progressif 3 / 15 / 30 / 40 %, **plafonné à 30 %** | travailleur (retenu) | loi 23/053 art. 118 |

**LE TOTAL PATRONAL CNSS EST 13 %**, et il ne faut jamais l'additionner aux
5 % du travailleur en « 18 % ». Le décompte final du CPCC le dit d'ailleurs
lui-même dans ses points de vigilance.

### 2.3 Le barème IRPP porte une tension que le texte ne tranche pas

Le taux marginal est de 40 %, et le même article plafonne l'impôt total à 30 %
du revenu imposable. Le plafond finit toujours par mordre : au-delà d'un
certain revenu, le taux marginal effectif est 30 % et non 40 %. **Le texte ne
commente pas cet effet** ; le coder sans le plafond donne un impôt faux sur les
hauts salaires, sur un bulletin d'apparence juste.

Double arrondi, et les deux comptent : assiette **au millier de francs
inférieur** (art. 118), puis impôt selon l'art. 150.

### 2.4 La liste des retenues autorisées est FERMÉE

Code du travail, art. 111 et 112. Toute amende est nulle ; toute réduction à
titre de dommages-intérêts est nulle. Sept retenues seulement sont permises :
fiscales, cotisation de sécurité sociale, avances, indemnités compensatoires
de l'art. 52, cautionnement, prêt, saisie-arrêt.

### 2.5 La quotité cessible et saisissable, art. 114

Un cinquième sur la partie n'excédant pas **cinq fois le salaire mensuel
minimum interprofessionnel de sa catégorie**, un tiers sur le surplus ; deux
cinquièmes pour une obligation alimentaire légale, **cumulables**. Et le calcul
se fait **après** déduction des retenues fiscales et sociales **et de
l'évaluation forfaitaire du logement de l'art. 139**.

---

## 3. Ce qui manque, et ce que chaque manque bloque

| Manque | Ce qu'il bloque | Voie |
|---|---|---|
| **Le SMIG** · cité par au moins cinq articles (décret 18/041 art. 8 ; AM 146 art. 94, 98, 102 ; loi 16/009 art. 75, 95), **jamais chiffré dans le corpus** | le plancher d'assiette CNSS ET la quotité saisissable de l'art. 114 | trouver le décret en vigueur |
| **L'arrêté de l'art. 139** (valeur forfaitaire du logement) | la quotité saisissable, seconde fois | chercher l'arrêté |
| **L'arrêté INPP n° 002/CAB/MET/2025** · cité par le dépôt, absent des compétences | rien aujourd'hui, mais le taux reste invérifiable | à verser au corpus |
| **La convention collective** · l'art. 114 raisonne par CATÉGORIE, et le décompte final montre qu'un protocole sectoriel change le barème de préavis | le décompte final et toute catégorisation | donnée du dossier, à saisir |

**AUCUN DE CES QUATRE NE SE COMBLE DE MÉMOIRE.** Le SMIG en particulier est le
genre de chiffre qu'on croit connaître.

---

## 4. Le piège de cette passe · un document précieux et daté

Le séminaire CPCC sur le décompte final est la meilleure méthode de calcul du
corpus. **Trois de ses chiffres sont périmés, et un de ses renvois de compte
est faux dans les deux plans.**

1. **« IPR : 10 % de la base imposable »** · l'IPR est ABROGÉ depuis le
   1er janvier 2026. Le régime en vigueur est l'IRPP, progressif de 3 à 40 %
   et plafonné à 30 %. Un taux plat de 10 % sous-impose tout salaire moyen et
   sur-impose les plus bas. Le dépôt note déjà que « une part importante de la
   documentation congolaise en ligne, pages de la DGI comprises, décrit encore
   le régime abrogé ».
2. **« ONEM 0,2 % »** · c'est 0,5 % depuis le 25/09/2025.
3. **« Syndicat : 2 % de la base imposable »** · **aucune base dans le Code**.
   L'art. 112 ferme la liste des retenues autorisées et la cotisation
   syndicale n'y figure pas ; le mot « cotisation syndicale » n'apparaît nulle
   part dans le texte verbatim. Tension signalée, non tranchée : la pratique
   existe, le fondement n'a pas été trouvé.
4. **« C/ 4331 INPP · C/ 4332 ONEM »** · **FAUX DANS LES DEUX PLANS**. Le 4331
   est « Mutuelle » et le 4332 « Assurances retraite », au SYSCOHADA comme au
   SYCEBNL. Un cabinet qui suivrait ce schéma porterait l'INPP à la mutuelle et
   l'ONEM aux assurances retraite : l'écriture s'équilibre, la balance boucle,
   et la Note annexe des organismes sociaux publie deux natures fausses.

Le fichier lui-même porte l'avertissement qui sauve : « en cas de désaccord
entre ce fichier et un article du Code, l'article prime ». Il vaut pour la
MÉTHODE, pas pour les chiffres ni pour les numéros.

---

## 5. LE DIX-NEUVIÈME « UN NUMÉRO, DEUX SENS », ET IL PORTE LA LIGNE LA PLUS
## LOURDE DE LA PAIE

La cotisation de retraite obligatoire · 10 % de la masse salariale, la plus
grosse ligne du bulletin après le salaire lui-même.

| | SYSCOHADA | SYCEBNL |
|---|---|---|
| 431 Sécurité sociale | 4311 prestations familiales · 4312 accidents du travail · **4313 Caisse de retraite OBLIGATOIRE** · 4314 facultative · 4318 autres | 4311 · 4312 · 4318 · **AUCUN 4313** |
| 432 | **43200000 Caisses de retraite COMPLÉMENTAIRE** (compte unique) | en-tête · **4321 OBLIGATOIRE** · 4322 complémentaire · 4328 autres |

**Le 4313 n'existe pas au SYCEBNL**, et le schéma du décompte final l'emploie
pour la CNSS des deux côtés. Servir le 4313 à une association l'enverrait sur
un compte que son plan n'ouvre pas · l'écriture serait refusée à la saisie,
après que la paie entière a été chiffrée.

**ET LA CORRECTION ÉVIDENTE EST UN PIÈGE.** Corriger « 4313 » en « 432 »
paraîtrait raisonnable : au SYCEBNL le 4321 est bien la retraite obligatoire.
Au SYSCOHADA, le 432 est la retraite **COMPLÉMENTAIRE**. La même correction
range donc la cotisation obligatoire sous une nature facultative dans un plan
sur deux, et rien ne le signale.

**Règle qui en sort, et elle est la même que pour les stocks et les
emballages : aucun numéro de compte de paie ne s'écrira ailleurs que dans une
table nommée, et aucun sans son référentiel.**

---

## 6. Une ASYMÉTRIE DE SEMIS, et une LACUNE DÉCLARÉE À TORT

**L'asymétrie.** Le semis SYCEBNL ouvre `43340000 INPP` et `43350000 ONEM`,
subdivisions de 433 créées par l'éditeur et déclarées comme telles, « le plan
SYCEBNL étant régional et ne nommant aucun organisme congolais ». **Le semis
SYSCOHADA ne les porte PAS**, alors que `correspondance-retenues.ts` pointe les
clés `inpp` et `onem` vers les comptes `4334` et `4335` **pour les deux
référentiels**. Une société commerciale n'a donc aujourd'hui aucun compte où
porter l'INPP et l'ONEM, et le registre des retenues cherche chez elle deux
comptes qui n'existent pas. **À trancher en P1**, pas ici : ouvrir deux comptes
au plan semé change le plan de tout dossier nouveau, et cela se décide, pas se
glisse dans une passe de lecture.

**La lacune déclarée à tort.** Le commentaire du semis SYCEBNL écrit, sur
l'ONEM : « aucun texte ne figure au corpus consulté pour le taux couramment
pratiqué de 0,2 % : le compte est ouvert, le taux n'est PAS inscrit dans le
logiciel ». C'était vrai quand il a été écrit. **Ce ne l'est plus** :
l'arrêté n° 028/2025 est au corpus, il fixe 0,5 % depuis le 25/09/2025, et
`correspondance-retenues.ts` le code déjà avec sa date d'effet et ses
sanctions. Le commentaire est corrigé du même geste · une lacune déclarée à
tort est aussi fausse qu'une règle inventée, et celle-ci faisait renoncer à
une règle que le logiciel applique déjà trente fichiers plus loin.

---

## 7. Ce que P0 laisse décidé pour la suite

- **Deux assiettes, jamais une.** Le moteur portera l'assiette sociale et
  l'assiette fiscale séparément, et le logement sera le cas d'essai qui les
  sépare.
- **Tout est daté.** Le barème IRPP, les taux CNSS, le taux ONEM (0,2 puis
  0,5) et les tranches INPP changent à des dates différentes. Un bulletin de
  septembre 2025 et un bulletin d'octobre 2025 ne portent pas le même taux
  ONEM. Même discipline de bornage que les textes fiscaux, qui a déjà coûté
  deux corrections au dépôt.
- **Le plafond de l'IRPP se code avec le barème**, jamais après.
- **Une table de comptes par référentiel**, sur le modèle de
  `nomenclature-stocks.ts` et de `nomenclature-emballages.ts`.
- **Le décompte final (P4) attend le SMIG.** L'art. 114 ne se calcule pas sans
  lui, et l'art. 139 ne se calcule pas sans son arrêté.
- **Le module détiendra des données personnelles** · situation de famille,
  nationalité, salaire. C'est le premier du dépôt dans ce cas, et la liste
  d'exclusion du journal d'audit demandera une passe propre en P1.

## 8. Ce qui est demandé à Manasse

1. **Le SMIG en vigueur** (décret), sans lequel ni le plancher d'assiette ni la
   quotité saisissable ne se calculent.
2. **L'arrêté de l'art. 139** sur la valeur forfaitaire du logement.
3. **L'arrêté interministériel n° 002/CAB/MET/2025** sur l'INPP, à verser au
   corpus · le dépôt en cite les tranches sans pouvoir les vérifier.
4. Le point de savoir si une **cotisation syndicale** se retient légalement,
   l'art. 112 fermant la liste sans la nommer.
