# Audit des citations juridiques du logiciel · 6 septembre 2026

Demandé par Manasse après une série de corrections de citations qui a fait douter
de la fiabilité de l'ensemble. Objet : vérifier, une par une et contre la source,
les références légales que le logiciel affiche ou applique.

**Ce document n'est pas une déclaration de conformité.** C'est un relevé : ce qui a
été vérifié, contre quoi, et avec quel verdict. Ce qui n'y figure pas n'a pas été
vérifié, et c'est dit à la fin.

## Méthode

Le périmètre ne dépend d'aucun souvenir. Un script
(`scripts/extraire-citations.py`) ratisse `src/`, `client/src/` et `prisma/` et
extrait toute ligne portant un motif de citation : article, numéro de texte, norme
ISA/IFRS, référentiel, taux, titre ou chapitre. Résultat brut :

| | |
|---|---|
| Lignes portant au moins une citation | **7 961** |
| Fichiers concernés | **442** |

7 961 lignes ne se vérifient pas honnêtement en une passe. Le lot a donc été trié
par **ce qu'une erreur coûte**, et non par commodité.

**LOT A · la citation porte un chiffre opposable** (taux, seuil, délai, montant)
que le cabinet applique ou déclare. Une erreur s'y paie en francs ou en amende.
**89 lignes, 31 fichiers. Toutes vérifiées.**

**LOT B · la citation est explicative** (un article nommé dans un commentaire, un
renvoi de méthode, un intitulé de référentiel). 7 872 lignes. **Non vérifiées à ce
jour.**

## Lot A · résultat

**87 citations exactes sur 89.** Deux défauts, tous deux de forme, aucun chiffre
faux. Le détail par bloc :

### Bloc 1 · loi n° 23/053 (IS et IRPP) · 26 citations, 26 exactes

Source lue : `fiscalite-rdc/socle/references/parametres-2026.md` et la compilation
DGI au 19/07/2026 (`code-general-2026/references/03` à `06`).

| Citation du logiciel | Source | Verdict |
|---|---|---|
| art. 44 · dons dans la limite de 0,5 % du CA | table des plafonds, art. 44 | exact |
| art. 43 · redevances entités liées, 3,5 % du CA HT | idem | exact |
| art. 49, 1° · cadeaux, 2 ‰ du CA HT | idem | exact |
| art. 49, 2° · frais de représentation, 60 % de leur montant | idem | exact |
| art. 49, 7° · frais de communication, 50 % | idem | exact |
| art. 56 · IS à 30 % | table IS | exact |
| art. 57 · impôt minimum 1 % du CA | idem | exact |
| art. 51 · report déficitaire sur trois exercices, sans plafond de 60 % | art. 51 lu | exact |
| art. 107 · micro-entreprise, 25 000 000 FC | table des régimes | exact |
| art. 109 · petite entreprise, 25 000 001 à 300 000 000 FC | idem | exact |
| art. 112 · régime réel au-delà | idem | exact |
| art. 118 · barème progressif sur le REVENU NET GLOBAL | art. 118 lu | exact |
| art. 122 · minimum 1 %, micro-entreprises dispensées | art. 122 lu, alinéa final | exact |
| art. 127 · 1 % vente, 2 % prestations | art. 127 | exact |
| art. 128 · forfait annuel par arrêté | AM 015/2025 | exact |
| art. 144 · non-résidents, 14 % du brut | table des retenues | exact |
| art. 145 à 149 · expatriés, 25 % | idem | exact |
| art. 146 · assiette, montant brut des rémunérations de l'art. 68 | art. 146 lu | exact |
| art. 149 ter · assiette du prélèvement non-résidents | art. 149 ter lu | exact, cité verbatim |
| art. 149 quater · 20 % du montant brut | art. 149 quater lu | exact |
| art. 20 · conditions de déductibilité des charges | art. 20 lu | exact |
| art. 50, 2° · prélèvement expatriés non déductible | table | exact |
| art. 136 / 138 · réévaluation, 30 avril et 300 000 FC par jour | vérifié le 04/09 | exact |
| art. 141, 1° · comptabilité exprimée en franc congolais | vérifié en M1 | exact |
| arrêté n° 014/2025 · petit matériel, 500 USD | table des mesures d'exécution | exact |
| arrêté n° 013/2025 · barème d'amortissement | idem | exact |

### Bloc 2 · loi de procédures fiscales · 6 citations, 6 exactes

| Citation | Source | Verdict |
|---|---|---|
| art. 57 bis · 30 %, 30 %, 20 % aux 25 juillet, septembre, novembre | table des acomptes | exact |
| art. 57, al. 3 et 57 quater · 60 % au 31 janvier, 40 % ensuite | art. 57 quater | exact, réserve du texte officiel portée |
| art. 57 · retenue locative reversée dans les dix jours | art. 57, remplacé par la loi 23/052 | exact |
| art. 94 · amende 5 000 000 / 2 500 000 / 250 000 selon la taille | art. 94, modifié par la LF 23/056 art. 29 | exact |
| art. 98 bis · amende de 50 % de l'acompte non versé | art. 98 bis lu | exact, cité verbatim |
| art. 22 bis · prélèvement non-résidents | table | exact |

### Bloc 3 · TVA · 10 citations, 10 exactes

| Citation | Source | Verdict |
|---|---|---|
| taux normal 16 %, réduits 1 % et 5 % (billets d'avion), zéro | art. 35, modifié par l'art. 46 de la LF 25/060 | exact, y compris le piège du 5 % réservé aux seuls billets d'avion |
| art. 14 · seuil d'assujettissement, 80 000 000 FC | art. 14 lu | exact |
| décret n° 011/42, art. 42-43 · même seuil, CA hors TVA | art. 42 et 43 du décret | exact, les deux articles bien distingués |
| art. 25, 2° · exigibilité à l'encaissement pour les prestations | art. 25 lu | exact |
| art. 41, 7° · cadeaux, sauf objets publicitaires de faible valeur | art. 41 lu | exact, exception portée |
| art. 42, 2° · transports de personnes, sauf contrat permanent | art. 42 lu | exact, exception portée |
| art. 45 · prorata définitif arrêté au plus tard le 31 mars | art. 45 lu | exact |
| art. 46 · variation de plus de 10 % sur quatre ans | art. 46 lu | exact |
| art. 52 · récupération sur ventes annulées, note de crédit | art. 52 lu | exact |
| décret art. 126 · avoir fournisseur | décret | exact |

### Bloc 4 · cotisations sociales · 6 citations, 5 exactes, 1 réserve

| Citation | Source | Verdict |
|---|---|---|
| CNSS · 6,5 % familles, 10 % pensions (5+5), 1,5 % risques, doublable | décret n° 18/041, art. 2 à 5 | exact |
| INPP · 4 % public, 3,5 % (1-50), 3 % (51-300), 2 % (>300) | arrêté interministériel du 24/09/2025, art. 1er | exact |
| INPP · en vigueur depuis le 24 septembre 2025 | art. 3, « à la date de sa signature », signé le 24 | exact |
| ONEM · 0,5 % depuis le 25/09/2025, 0,2 % avant (AM 095/2018) | AM 028/2025, art. 1er et 10 | exact sur les taux et la date d'effet |
| ONEM · sanctions 50 % et majoration 0,5 % par jour | AM 028/2025, art. 2 et 3 | exact |
| **ONEM · date de l'arrêté** | **le texte se date lui-même du 24 dans son intitulé et du 25 à sa signature** | **DÉFAUT 1 · voir ci-dessous** |

### Bloc 5 · OHADA · 11 citations, 10 exactes, 1 défaut

| Citation | Source | Verdict |
|---|---|---|
| SYCEBNL art. 5 · Système normal la règle, SMT l'exception de taille | art. 5 lu | exact |
| SYCEBNL art. 6 · 30 000 000 FCFA par catégorie de ressources | art. 6 lu | exact, réserve de conversion portée |
| SYCEBNL art. 19 · bilan > 100 M, ressources > 200 M, effectif > 20 | art. 19 lu | exact |
| SYCEBNL art. 19, al. 4 · 45 jours avant l'assemblée générale | art. 19, 4e alinéa | exact, l'alinéa est bien le quatrième |
| SYCEBNL art. 24 à 27 · sanctions pénales | art. 24-27 | exact |
| AUDCIF art. 13 · SMT, 60 / 40 / 30 millions FCFA | art. 13 lu | exact |
| AUDCIF art. 17, 1° · unité monétaire ayant cours légal | vérifié en M1 | exact |
| AUDCIF art. 43 · valeur d'inventaire supérieure, valeur d'entrée maintenue | vérifié le 06/09 | exact |
| AUSCGIE art. 385 · SA, apports, actionnaire unique possible | art. 385 lu | exact |
| AUSCGIE art. 387 · capital minimum 10 000 000 FCFA | art. 387 lu | exact |
| AUSCGIE art. 702 · commissaire aux comptes obligatoire | art. 702 lu | exact |

### Bloc 6 · Guide d'application SYCEBNL · 1 citation, 1 défaut

| Citation | Source | Verdict |
|---|---|---|
| « reprise sur 10 ans, art. 3 » | la règle vient de l'**Application 3** du Guide | **DÉFAUT 2 · voir ci-dessous** |

## Les deux défauts, et ce qu'ils coûtaient

### Défaut 1 · une incohérence du texte officiel reproduite en silence

L'arrêté ONEM n° 028/2025 se date lui-même du **24 septembre** dans son intitulé et
du **25 septembre** à sa signature. Le logiciel portait les deux dates sans dire
pourquoi : « du 24 septembre 2025 » d'un côté, « à partir du 25 septembre 2025 »
de l'autre. Les deux étaient fidèles à la source, mais leur écart paraissait être
une faute du logiciel.

La règle de maison (CLAUDE.md § 9) veut qu'une anomalie du texte officiel soit
signalée sur place, jamais reproduite en silence. La réserve est désormais écrite,
et l'intitulé ne porte plus de date qui contredirait la date d'effet.

Portée réelle : un jour, sans effet sur un exercice civil. Ce qui était en jeu est
la confiance dans la ligne, pas le montant.

### Défaut 2 · un article qui n'existe pas

Le commentaire du champ `defaut` de `ParametreModele` annonçait la reprise d'une
subvention sur dix ans comme posée par « l'**art. 3** ». Aucun article ne la pose :
elle vient de l'**Application 3** du Guide d'application SYCEBNL, ce que le
catalogue écrit d'ailleurs correctement à côté (`applicationGuide: 'App. 3'`, avec
la citation verbatim de la règle).

Un article de l'Acte uniforme et une application du Guide n'ont ni la même
autorité, ni la même numérotation. Et l'art. 3 du SYCEBNL existe : c'est celui qui
écarte des articles de l'AUDCIF. Un relecteur envoyé là aurait lu un texte sans
aucun rapport avec la règle qu'il vérifiait.

Portée réelle : aucune sur le calcul, la valeur de 10 ans étant juste. Le coût est
sur la vérifiabilité, qui est justement ce que ces commentaires servent.

**Le test qui l'aurait attrapé** est écrit dans le même commit
(`operation-specifique.service.spec.ts`). Il RELIT LES FICHIERS plutôt que les
objets en mémoire, parce que le défaut vivait dans un commentaire que rien
d'exécuté ne traverse ; un test qui n'aurait inspecté que le catalogue serait passé
au vert sur le défaut qu'il est censé fermer. Vérifié par réintroduction du défaut
d'origine : le test tombe, puis repasse au vert une fois corrigé.

## Lot B · résultat

**206 références distinctes sur 206 vérifiées. Trois défauts.**

7 872 lignes ne portent pas 7 872 références : la même citation revient des
dizaines de fois (« AUDCIF art. 22 » figure 52 fois). Un second script
(`scripts/index-citations-lot-b.py`) rattache chaque article au corpus nommé sur
sa ligne et déduplique. Il reste **206 couples (texte, article) distincts** :

| Corpus | Références distinctes |
|---|---|
| AUDCIF | 41 |
| loi n° 23/053 | 35 |
| SYCEBNL | 27 |
| AUSCGIE | 22 |
| Loi de procédures fiscales | 20 |
| loi n° 004/2001 | 19 |
| TVA (O.-L. n° 10/001) | 12 |
| AUSCOOP | 11 |
| SYSCOHADA | 9 |
| AUDCG | 5 |
| Code des douanes, Code du numérique, CPCC | 5 |

Chaque couple a été rapproché de l'OBJET de son article, extrait de la
compétence. Deux contrôles ont servi : la **plage** (un corpus a un dernier
article · le SYCEBNL s'arrête à 28, l'AUDCIF à 113), puis la **lecture du
rapprochement**, article par article.

Le contrôle de plage a levé neuf alertes. **Huit étaient des défauts de mon
propre extracteur**, pas du logiciel : sur une ligne comme « l'art. 3 du SYCEBNL
exclut les art. 73 à 113 », le script rattache le 73 au SYCEBNL alors que la
phrase le rattache à l'AUDCIF. Ce sont même les lignes les plus rigoureuses du
dépôt. La neuvième était réelle.

### Les trois défauts

**1 · un article cité sans son texte, à côté d'un autre qui porte le sien.**
`correspondance-inventaire-syscohada.ts` affichait : « L'article 138 nomme le
gérant, le conseil d'administration ou l'administrateur général […] Le livre
d'inventaire, lui, reste dû (**AUDCIF art. 19**). » L'article 138 est celui de
l'**AUSCGIE** ; l'AUDCIF s'arrête à 113. La lecture naturelle du message
attribuait le 138 à l'AUDCIF, seul texte nommé. Corrigé en nommant l'AUSCGIE.

**2 · la définition renvoyée au mauvais article.** Le refus d'affecter un
dividende à une EBNL disait « c'est ce qui la définit (SYCEBNL, **art.
premier**) ». L'art. premier institue le système comptable. La définition est à
l'**art. 2**, et elle n'est pas formulée comme le message le disait : le texte
parle d'un « **but désintéressé** » et de ressources qui « servent au
fonctionnement et à la réalisation de son objet social », là où le message
écrivait « ne distribue pas de résultat à ses membres ». La conclusion tenait,
la source non.

**3 · une anomalie du texte officiel reproduite sans être signalée, et glosée.**
Le planning de clôture annonçait : « Le manquement est sanctionné par l'article
19, c'est-à-dire par la dissolution : c'est l'obligation la plus lourdement
sanctionnée de toute la loi 004/2001. »

Le **renvoi est exact** · l'art. 4, e) écrit littéralement que la déclaration
semestrielle doit être renouvelée « **sous peine d'application de l'article
19** ». Mais l'article 19 organise la dissolution **VOLONTAIRE**, décidée par
les deux tiers des membres effectifs ; la dissolution **JUDICIAIRE** de
l'association « qui ne remplit plus ses engagements » est à l'**article 20**,
prononcée par le Tribunal de Grande Instance à la requête d'un membre ou du
Ministère Public.

Le renvoi de l'art. 4, e) est donc vraisemblablement fautif dans la loi
elle-même. La règle de maison (§ 9) veut qu'une telle anomalie soit signalée sur
place, jamais reproduite en silence · le message la reproduisait ET en tirait
une conclusion (« c'est-à-dire par la dissolution ») que l'article ne porte pas.
Le message cite désormais l'art. 4, e) mot pour mot, expose la réserve, et ne
conclut plus à une sanction automatique.

C'est le défaut le plus sérieux des deux lots : un message d'interface qui
annonçait à un cabinet la sanction la plus lourde de la loi, sur un article qui
dit autre chose.

### Le test

`src/common/citations-articles.spec.ts` balaie tout le dépôt et refuse un
article dont le numéro dépasse le dernier article du corpus nommé. **Sa portée
est étroite et le fichier le dit** : trois familles de lignes en sortent (deux
corpus nommés, une loi numérotée à côté, un marqueur d'exclusion), et le test
lit une fenêtre de quatre lignes de part et d'autre, parce qu'une citation
s'étale souvent sur trois lignes et que juger la ligne seule signalait six
passages parfaitement corrects. Deux tests ciblés ferment les défauts 2 et 3 par
leur libellé.

Les trois défauts ont été réintroduits un par un pour vérifier que les tests
tombent, puis retirés. Sans cette vérification, un test qui passe ne prouve
rien.

Le test d'affectation qui gelait l'ancien libellé est tombé à la correction · il
faisait son travail, et il porte maintenant la formule du texte avec la raison
du changement.

## Lot C · les 1 683 citations sans texte nommé

Une citation qui ne nomme pas son texte n'est pas fausse · elle est
**indécidable**, ce qui revient au même pour qui veut la vérifier. Ces 1 683
lignes ont été résolues par couches successives, de la plus sûre à la plus
faible :

| Couche de résolution | Lignes |
|---|---|
| Un texte est nommé dans les 12 lignes voisines | **912** (564 couples distincts) |
| Le FICHIER ne nomme qu'un seul corpus | 100 |
| Un corpus domine le fichier d'un facteur trois | 35 |
| Le fichier nomme plusieurs textes à parts voisines | 520 |

Les 520 dernières ne se lisent pas une par une avec profit : dans
`taux-tva.service.ts`, un « art. 41 » désigne évidemment la TVA. Le risque réel
est ailleurs, et il est mesurable : **un numéro d'article que DEUX des textes
cités par le même fichier portent réellement**. C'est la seule configuration où
un lecteur ne peut pas trancher. Le contrôle en relève 394, concentrées sur le
module fiscal.

### Le défaut · deux articles 57, deux lois, un seul module

L'**article 57 de la loi n° 23/053** pose l'**impôt minimum** de 1 % du chiffre
d'affaires. L'**article 57 de la loi de procédures fiscales** pose les
**modalités de paiement**. Le module fiscal manie les deux, à quelques lignes
l'un de l'autre, et servait « art. 57 » nu dans six messages d'écran.

Le pire mêlait les deux lois dans une seule phrase, sans en nommer aucune :

> « Art. 57 : une micro-entreprise acquitte le forfait annuel de l'**art. 128**
> et ne verse ni acompte provisionnel (art. 57, al. 2) ni quotité (art. 57, al.
> 3). »

L'art. 128 est de la loi n° 23/053, l'art. 57 de la loi de procédures fiscales.
Un lecteur ne pouvait pas le savoir.

**Aucune de ces citations n'était fausse.** Elles renvoyaient toutes au bon
article de la bonne loi · simplement, rien ne disait laquelle. Six messages
servis à l'écran nomment désormais leur loi, et le commentaire du calendrier
explique la collision.

C'est la sixième fois que ce dépôt rencontre « un numéro, deux sens » après le
192, le 4181, le 1061/1062, le 38/37 et le 397, et la deuxième sur un numéro
d'ARTICLE après les deux articles 11 de la retenue locative.

### Le test, et ce qu'il a fallu pour qu'il vaille quelque chose

Le test refuse tout message servi citant un art. 56 ou 57 sans nommer sa loi. Il
a été **faux deux fois avant d'être juste**, et les deux erreurs sont écrites
dans le fichier :

- sa fenêtre de contexte remontait deux lignes en arrière et captait la mention
  d'une chaîne VOISINE · il ne remonte plus que le long d'une concaténation ;
- son filtre ignorait les branches de ternaire, qui commencent par « ? » ou
  « : » avant leur chaîne · c'est-à-dire précisément le message d'impôt minimum
  par lequel le test est né.

Les deux fois, c'est la **réintroduction du défaut** qui l'a montré. Un test qui
passe sans cette épreuve ne prouve rien, et celui-ci passait au vert sur le
défaut qu'il était censé fermer.

Les articles « 57 bis », « ter » et « quater » sont hors périmètre : ils
n'existent que dans la loi de procédures fiscales, le suffixe lève à lui seul
l'ambiguïté.

## Ce qui n'a pas été vérifié

**Ce qui reste hors des trois lots.** 4 033 lignes nomment un texte sans citer
d'article · elles ne portent aucune référence vérifiable article par article.
S'y ajoutent quatre corpus non indexés (Code des douanes, Code du numérique,
CPCC, SYSCOHADA hors AUDCIF), soit 14 références lues mais sans rapprochement
mécanique, et les 520 lignes du lot C dont le fichier nomme plusieurs textes
sans collision de numéro · leur rattachement se lit au sujet du fichier, et
aucune ne pose de choix indécidable.

Deux points relevés au passage et laissés en réserve plutôt que tranchés :

- **l'art. 43 de l'AUDCIF sur un compte 52.** Le refus de comptabiliser un excédent
  d'inventaire cite l'art. 43 partout sauf sur un 57, où la citation a été corrigée
  le 6 septembre. Un excédent sur une BANQUE est un écart de rapprochement, pas une
  variation de valeur : la citation y mérite le même examen que celle de la caisse.
  Elle n'est pas fausse, elle est peut-être hors sujet ;
- **le seuil de l'art. 24 ter LPF** (20 000 USD, prix de transfert) repose sur un
  arrêté de 2017 pris sous l'ancien régime IBP. Le socle signale que sa validité
  sous le régime IS n'est pas expressément reconfirmée. Le logiciel ne l'applique
  pas aujourd'hui ; si un module de prix de transfert s'ouvre, c'est le premier
  point à trancher.

## Ce que l'audit dit du logiciel

Sur les 89 références qui commandent un montant, une échéance ou un seuil, **aucun
chiffre n'est faux**. Sur les 206 références explicatives distinctes, **203 sont
exactes**. Sur les 1 683 citations sans texte nommé, **aucune ne renvoie au
mauvais article** · six étaient seulement indécidables, et le sont restées
jusqu'à aujourd'hui.

Les cinq défauts des deux lots sont tous des RENVOIS, aucun n'est un calcul : un
taux rattaché à son texte modificatif plutôt qu'à son texte porteur, une
application du Guide annoncée comme un article, un article cité sans son texte à
côté d'un autre qui porte le sien, une définition renvoyée à l'article voisin, et
une anomalie du texte officiel reproduite sans réserve puis glosée.

C'est cohérent avec ce que les corrections des jours précédents avaient déjà montré :
ce sont les RÉFÉRENCES qui ont été écrites trop vite, jamais les calculs. La
conclusion pratique est que les citations doivent être lues à la source AVANT
d'être écrites, ce que la règle n° 1 de CLAUDE.md dit déjà et que le lot A vient
de mesurer.
