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
| INPP | 4 % public · 3,5 % (1 à 50) · 3 % (51 à 300) · 2 % (> 300) | employeur | arrêté interministériel n° 002/CAB/MET/2025, n° 003/CAB/VPM/MIN/BUD/2025 du 24/09/2025, art. 1er · **AU CORPUS, texte intégral** (corrigé le 19/09/2026) |
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
| **L'arrêté de l'art. 139** (valeur maximale de remboursement du logement fourni en nature) | la déduction de l'alinéa 4 de l'art. 114, donc la quotité saisissable dès qu'un logement est fourni en nature | **MANQUE RÉEL, RÉTABLI EN P5** · sa radiation du 19/09 confondait deux objets |
| **L'arrêté INPP** · cité par le dépôt sous un numéro introuvable et daté à tort | rien aujourd'hui, mais le taux restait invérifiable ET sa date d'effet était fausse | à verser au corpus · **date corrigée le 19/09/2026** |
| **La convention collective** · l'art. 114 raisonne par CATÉGORIE, et le décompte final montre qu'un protocole sectoriel change le barème de préavis | le décompte final et toute catégorisation | donnée du dossier, à saisir |

**AUCUN DE CES QUATRE NE SE COMBLE DE MÉMOIRE.** Le SMIG en particulier est le
genre de chiffre qu'on croit connaître.

**MISE À JOUR DU 19/09/2026 · la passe de recherche
(`docs/paie-recherche-textes-2026-09-19.md`) en a ramené trois choses.**

1. ~~**L'arrêté de l'art. 139 n'existe pas.**~~ **CETTE CONCLUSION EST FAUSSE,
   CORRIGÉE EN P5.** Elle prenait la **contre-valeur du logement** du décret
   n° 25/22 pour la **valeur maximale de remboursement** de l'art. 139 a).
   Ce sont deux objets, deux auteurs et deux conditions. L'arrêté de
   l'art. 139 reste introuvable, et c'est lui, et lui seul, que l'alinéa 4 de
   l'art. 114 fait déduire. Le manque annoncé au tableau ci-dessus était donc
   RÉEL · c'est sa radiation qui était l'erreur. Voir
   `docs/paie-p5-quotite-et-livre-de-paie.md`.
2. **Le SMIG est identifié** · décret n° 25/22 du 30 mai 2025, dix articles au
   moins et une ANNEXE de tension salariale. Identifié, pas lu : la sortie
   réseau de l'environnement a refusé les six dépôts qui le portaient.
3. **L'INPP portait un défaut, pas seulement un doute.** Le dépôt datait le
   nouveau barème du 24 septembre 2025, qui est la date de signature ·
   l'entrée en vigueur est au 1er janvier 2026, et un exercice 2025 relève du
   barème de 2006 (3 %, 2 %, 1 %). Corrigé, avec deux tests vus tomber.

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
  lui, et l'art. 139 ne se calcule pas sans son arrêté. **P5 nuance le
  premier point** · la quotité de l'art. 114 se calcule dès que la CLASSE du
  décret n° 25/22 est connue, la convention collective n'y entrant pas · seul
  le logement fourni en nature reste bloqué, et par l'arrêté de l'art. 139.
- **Le module détiendra des données personnelles** · situation de famille,
  nationalité, salaire. C'est le premier du dépôt dans ce cas, et la liste
  d'exclusion du journal d'audit demandera une passe propre en P1.

## 8. Ce qui est demandé à Manasse

1. **Le SMIG en vigueur** (décret), sans lequel ni le plancher d'assiette ni la
   quotité saisissable ne se calculent.
2. **L'arrêté de l'art. 139** sur la valeur maximale de remboursement du
   logement fourni en nature. **DEMANDE RÉTABLIE EN P5** · elle avait été
   radiée le 19/09 au motif qu'elle était « dans le décret du point 1 ». Elle
   ne l'est pas : le décret fixe une contre-valeur, l'arrêté fixe une valeur
   maximale de remboursement, et c'est celle-ci que l'art. 114 déduit.
3. ~~**L'arrêté interministériel INPP du 24 septembre 2025**~~ **SANS OBJET,
   ET DEPUIS LONGTEMPS · SIXIÈME LACUNE DÉCLARÉE À TORT.** Les DEUX arrêtés
   sont au corpus, en TEXTE INTÉGRAL, visas et trois articles compris, dans
   `smig-cotisations-textes-application/arretes-inpp-taux-cotisation-2006-2025.md`.
   Celui de 2025 porte « n° 002/CAB/MET/2025, n° […]/CAB/MIN/FINANCES/2025,
   n° 003/CAB/VPM/MIN/BUD/2025 du 24 septembre 2025 », celui de 2006
   « n° 12/MTPS/123, n° 007/CAB/MIN/FINANCES/2006, n° 001/CAB/MIN/BUD/2006 du
   14 février 2006 ». **Le seul fragment inconnu est le numéro du ministère des
   Finances pour 2025, MANUSCRIT ET ILLISIBLE sur l'original**, et le fichier
   du corpus le dit lui-même en note. Ce n'est pas un texte à verser : c'est
   une vérification au Journal officiel, et elle n'a d'objet qu'en contentieux.
   Le code du dépôt porte la référence complète depuis le jour du versement,
   avec deux tests qui la gèlent.
4. Le point de savoir si une **cotisation syndicale** se retient légalement,
   l'art. 112 fermant la liste sans la nommer. **C'est le SEUL point de cette
   liste qui attende encore quelque chose.**

---

# Addendum · le second document de cours (2026-09-19)

Un second extrait du même livre a été fourni en cours de passe : **27 pages,
pages 173 à 199**, couvrant les comptes de charges de la classe 6, une note
« Essentiel sur la fiscalité en RDC », et surtout **le chapitre 66, Charges de
personnel** avec ses barèmes et son journal complet. C'est le chapitre de la
paie, et il arrive à point.

**Même statut que le premier : une note de cours, pas une source.** Et le même
piège, en plus large · **la totalité de sa partie fiscale est bâtie sur le
régime abrogé** (IBP à 30 %, impôt minimum forfaitaire, acomptes de 40 % avant
le 1er août et le 1er décembre, IPR, IERE, comptes 44721 et 44722). Rien de
cela n'est repris : le dépôt porte déjà l'IS, l'IRPP et les échéances des
acomptes au 25 juillet, 25 septembre et 25 novembre de la loi de finances
n° 25/060.

## A. Ce que le chapitre 66 apporte, et qui MANQUAIT au corpus

### A.1 L'ORDRE DE CALCUL · l'IRPP s'assied APRÈS la CNSS

« L'IPR est calculée sur la rémunération imposable **NETTE du montant retenu
pour CNSS (QPO)**. » Aucun texte lu jusqu'ici ne donnait cet enchaînement. Il
décide de tout le moteur : brut → assiette sociale → CNSS 5 % → assiette
fiscale **nette de la CNSS** → barème → plafond. Le calculer dans l'autre sens
surestime l'impôt de 5 % de l'assiette.

**À CONFRONTER** à l'arrêté IRPP de 2025 avant d'être codé · le mécanisme est
ancien et le nom de l'impôt a changé, mais rien ne dit que la déductibilité de
la part ouvrière ait été reconduite telle quelle.

### A.2 LES AVANTAGES EN NATURE NE VONT PAS DIRECTEMENT EN CHARGES DE PERSONNEL

« Les avantages en nature dont bénéficie le personnel sont enregistrés dans les
**différents comptes de charges concernés**. Ces avantages en nature sont
ensuite **TRANSFÉRÉS** dans les frais de personnel (comptes 6617 et 6627). Les
entreprises débitent les comptes 6617 et 6627 par le crédit du compte 78
"Transfert de charges". »

Un logement fourni passe donc d'abord par sa nature (loyer, entretien), puis
est viré en 6617 par le 78. Porter l'avantage directement au 6617 donne le même
résultat net et **fausse la ventilation par nature du compte de résultat**,
exactement comme le virement du 637 au 667 que le dépôt surveille déjà.

### A.3 Les rémunérations dues à la clôture

« Les rémunérations dues à la clôture de l'exercice sont à inclure dans les
charges de l'exercice par le crédit du compte **422** ou par le crédit du
compte **428** "Personnel, charges à payer et produits à recevoir". »

### A.4 La décomposition de la rémunération

Gains = rémunérations directes (salaire de base, primes et gratifications,
congés payés, indemnités de préavis et de licenciement, salaire pour incapacité
de travail, allocations familiales légales, avantages en nature, heures
supplémentaires) **+** indemnités forfaitaires (logement, représentation,
transport, autres). Retenues = sociales et fiscales **+** occasionnelles
(avances, prêts, saisies-arrêts). Charges patronales à part.

## B. LE BARÈME MENSUEL EST LE BARÈME ANNUEL DIVISÉ PAR DOUZE, ET LES TRANCHES
## N'ONT PAS CHANGÉ ENTRE L'IPR ET L'IRPP

Le livre donne un barème **MENSUEL** de l'IPR :

| Taux | Minimum | Maximum | IPR mensuel cumulé |
|---|---|---|---|
| 3 % | 0 | 162 000 | 4 860 |
| 15 % | 162 001 | 1 800 000 | 250 560 |
| 30 % | 1 800 001 | 3 600 000 | 790 560 |
| 40 % | au-delà de 3 600 000 | | |

**Les trois bornes sont EXACTEMENT celles de l'art. 118 divisées par douze** ·
162 000 × 12 = 1 944 000 ; 1 800 000 × 12 = 21 600 000 ; 3 600 000 × 12 =
43 200 000. Et l'arithmétique de la colonne cumulée est juste au franc près
(3 % de 162 000 = 4 860 ; +15 % de 1 638 000 = 250 560 ; +30 % de 1 800 000 =
790 560).

**Ce que cela apprend, et c'est utile :** le changement d'IPR en IRPP au
1er janvier 2026 a changé le NOM et la BASE LÉGALE, pas les tranches. Le barème
mensuel du livre est donc directement exploitable, et il donne au moteur la
forme mensualisée que l'art. 118, rédigé en annuel, ne donne pas.

**DEUX RÉSERVES.** La colonne « tranche imposable » du livre porte 1 637 999 et
1 799 999 là où les bornes donnent 1 638 000 et 1 800 000 · coquille sans
portée sur la colonne d'impôt. Et surtout : **un barème mensualisé n'est pas
neutre**. L'art. 118 assied l'impôt sur le revenu net GLOBAL arrondi au millier
inférieur ; une retenue mensuelle est un ACOMPTE sur cet impôt annuel. Le
module devra dire lequel des deux il calcule.

## C. UN PLANCHER D'IMPÔT QU'AUCUNE AUTRE SOURCE NE PORTE

« **L'IPR ne peut être inférieur à 2.000 FC.** » Le fichier des paramètres
fiscaux du dépôt donne le barème et le plafond de 30 %, **jamais ce plancher**.
Piste réelle, à confronter à l'arrêté IRPP de 2025 et à la loi n° 23/053 avant
tout codage · un plancher de 2 000 FC hérité de l'IPR n'a pas été retrouvé dans
le régime actuel.

## D. TROIS CONTRADICTIONS DU LIVRE CONTRE LES TEXTES LUS

1. **LES SAISIES-ARRÊTS SONT FAUSSES DEUX FOIS.** Le livre écrit « 1/5 salaire
   brut pour des raisons financières et **2/3** pour cause d'obligation
   alimentaire ». L'**article 114 du Code du travail** dit : un cinquième sur
   la partie n'excédant pas **cinq fois le salaire mensuel minimum
   interprofessionnel de sa catégorie**, **un tiers sur le surplus**, et
   **deux cinquièmes** pour une obligation alimentaire. Le livre ignore le
   seuil des cinq SMIG, ignore le tiers au-delà, et donne 2/3 au lieu de 2/5.
   Une retenue calculée sur cette base **dépasserait la quotité légale** ·
   c'est la seule erreur du livre qui expose l'employeur.
2. **L'INPP est à l'ancien barème** · le livre donne 3 % public, 3 % de 1 à 50,
   2 % de 51 à 300, 1 % au-delà de 300. Le dépôt porte 4 % public, 3,5 %, 3 %
   et 2 %, sur l'arrêté interministériel n° 002/CAB/MET/2025. Le livre décrit
   l'état antérieur à septembre 2025.
3. **L'ONEM est à 0,2 %** · c'est 0,5 % depuis le 25 septembre 2025. Troisième
   document du corpus à porter l'ancien taux.

## E. Le journal d'une paie globale, qui vaut comme MODÈLE

L'exemple chiffré donne l'enchaînement complet, et c'est le seul du corpus :

```
4212  Personnel, acomptes                      à  521 Banques
6611  Appointements, salaires et commissions
6612  Primes et gratifications
6638  Autres indemnités et avantages divers (transport)
6618  Autres rémunérations directes (heures supp.)
6632  Indemnité de représentation                à  422 Personnel, rémunérations dues
422   Personnel, rémunérations dues              à  431 CNSS
                                                   4472 Impôts sur salaires
664   Charges sociales                           à  431 CNSS
422   Personnel, rémunérations dues              à  521 Banques
                                                   4212 Personnel, acomptes
431   Sécurité sociale                           à  521 Banques
```

**L'exemple ne démontre PAS les exclusions d'assiette** · ses cotisations sont
des DONNÉES, non calculées. L'indemnité de transport y est portée au brut en
6638 alors que l'arrêté n° 146/2018 l'exclut de l'assiette sociale. Le livre ne
se contredit pas, il ne traite simplement pas la question · et c'est un piège de
plus pour qui recopierait l'exemple en croyant y lire un calcul.

Coquille de l'énoncé, signalée : « Salaires et appointements de base : 82 600 »
là où la solution et le journal portent **820 600**. Le reste boucle (brut
884 200, retenues 17 750, net 866 450, acomptes 25 200, versé 841 250).

## F. Ce que l'addendum change au plan

- **P2 gagne son ordre de calcul** (A.1) et le mécanisme des avantages en
  nature (A.2), les deux plus grosses inconnues du moteur.
- **P2 gagne la forme mensualisée du barème** (B), avec la réserve « acompte
  mensuel ou impôt annuel ».
- **P4 gagne une confirmation** : l'art. 114 prime sur le livre, et le livre
  s'y trompe dans le sens qui expose l'employeur.
- **Deux pistes à confronter avant codage** : le plancher de 2 000 FC (C) et la
  déductibilité de la CNSS de l'assiette fiscale (A.1).
