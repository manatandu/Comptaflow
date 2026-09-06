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

## Ce qui n'a pas été vérifié

**Le lot B · 7 872 lignes.** Citations explicatives : un article nommé dans un
commentaire de méthode, un renvoi de chapitre, un intitulé de référentiel. Une
erreur y induit un lecteur en erreur mais ne change aucun montant.

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
chiffre n'est faux**. Les deux défauts trouvés sont des renvois : l'un reproduisait
une contradiction de sa source sans la nommer, l'autre pointait vers un texte qui
n'existe pas.

C'est cohérent avec ce que les corrections des jours précédents avaient déjà montré :
ce sont les RÉFÉRENCES qui ont été écrites trop vite, jamais les calculs. La
conclusion pratique est que les citations doivent être lues à la source AVANT
d'être écrites, ce que la règle n° 1 de CLAUDE.md dit déjà et que le lot A vient
de mesurer.
