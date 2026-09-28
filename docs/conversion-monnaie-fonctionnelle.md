# Conversion en monnaie fonctionnelle · ce que le texte impose

> **DÉPASSÉ SUR LA MÉTHODE · bandeau posé le 2026-09-28 (audit final F201).**
> La méthode qu'OmegaX a retenue pour le second jeu est celle que ce document
> condamne. La source à jour est le paragraphe « M2 · la balance en monnaie
> fonctionnelle, ligne à ligne au cours historique » de `CLAUDE.md`, et
> l'en-tête de `src/modules/monnaie-fonctionnelle/balance-fonctionnelle.service.ts`.
>
> **Ce qui est retenu.** La tenue reste en francs congolais, sans option
> (loi n° 23/053 art. 141, 1° · AUDCIF art. 17, 1°) : le second jeu part des
> livres en francs et les convertit VERS la monnaie fonctionnelle. Chaque
> écriture de l'exercice est convertie LIGNE À LIGNE au cours EN VIGUEUR À SA
> DATE, le dernier saisi à cette date ou avant au plan des devises du dossier,
> jamais un postérieur (`coursApplicable`), toutes les lignes d'une écriture au
> même cours ; une ligne déjà libellée dans la monnaie fonctionnelle garde son
> montant d'origine (`convertirLigne`). L'à-nouveau et la clôture ne se
> convertissent pas : l'ouverture reprend la clôture du MÊME jeu pour
> l'exercice précédent, et une reprise sans exercice précédent dans le dossier
> convertit son à-nouveau au cours de sa date, en le disant (`jeuFonctionnel`,
> audit final F42). L'écart de conversion est montré sur sa ligne, jamais logé
> dans un compte, et une écriture antérieure à tout cours saisi arrête l'état.
>
> **Ce qui est dépassé ci-dessous.**
>
> - **§ 1, dernier alinéa, et le verdict du § 3** · la « première tentative »
>   déclarée fausse (chaque ligne au cours de son jour, capital compris) est,
>   pour l'essentiel, la méthode retenue. Le premier tiret du § 3 (une ligne
>   d'acquisition convertie au cours de son jour EST le cours historique) est
>   la raison même que M2 en donne, et la propriété que son dernier alinéa dit
>   trompeuse (chaque écriture équilibrée après conversion) est celle que M2
>   veut garder. Ce que le § 3 lui reproche (cours de clôture pour le
>   monétaire, dotations au cours d'entrée du bien, résultat par différence)
>   sont les règles de la méthode temporelle, qui ne régit pas ce second jeu :
>   M2 écrit qu'aucun texte lu ne le régit. Et l'écart de conversion qu'il
>   réclame existe, d'une autre nature · il naît des lignes prises à leur
>   montant d'origine face à des lignes converties.
> - **§ 2, « Notre cas est le premier passage », et § 4, « par analogie »** ·
>   la méthode temporelle n'est pas appliquée au second jeu.
> - **§ 5** · aucun des cinq ouvrages n'a été construit pour le second jeu, et
>   la méthode retenue n'en demande aucun.
> - **§ 6** · le passage qu'il décrit (monnaie fonctionnelle vers francs) n'est
>   pas celui d'OmegaX, qui part des livres en francs : il suppose des livres
>   tenus en dollars ou en euros, ce que la règle de la monnaie de tenue
>   exclut, et il relève du cours de clôture, que M2 écarte (un bâtiment acquis
>   il y a six ans serait exprimé au cours d'aujourd'hui). La hiérarchie des
>   cours de clôture (cours du bailleur, cours BCC au 31 décembre, dernier jour
>   ouvré) n'est pas appliquée : aucun cours de clôture n'entre dans le second
>   jeu.
> - **§ 7** · sans objet pour le second jeu, qui n'emploie aucun cours moyen.
>
> **Ce qui reste juste.** La distinction du § 1 entre une opération en devise
> dans des livres en francs (Titre VIII ch. 22, réévaluation de clôture de la
> fenêtre « Devises et réévaluation », que le § 1 appelle module Réévaluation)
> et la traduction d'un jeu d'états complet ; la lecture du chapitre XII-4 au
> § 2, dont la consolidation joue la méthode du cours de clôture pour ses
> entités étrangères (paragraphe « Consolidation SYSCOHADA, tranche 4c » de
> `CLAUDE.md`) ; la portée établie au § 4 (le chapitre régit une entité
> étrangère consolidée, et l'art. 3 du SYCEBNL écarte les art. 73 à 113), qui
> s'accorde avec le constat de M2 ; et l'exigence que le second jeu dise par
> quelle méthode il a été produit, que la mention imprimée remplit
> (`MENTION_SANS_VALEUR_LEGALE`). Le corps est conservé tel quel, sans
> réécriture : effacer une erreur en efface aussi la leçon.

Recherche du 2026-09-05, faite après une première tentative fausse. Chaque
règle ci-dessous est lue dans le référentiel, aucune n'est écrite de mémoire.

## 1. Deux questions différentes, et les confondre est l'erreur

**Question A · une opération en devise dans des livres tenus en francs.**
C'est l'AUDCIF, Titre VIII ch. 22. Chaque opération s'enregistre au cours du
jour ; à l'inventaire, « les créances et dettes en monnaies étrangères sont
converties sur la base du **dernier cours de change à la date de clôture** » ;
l'écart devient gain ou perte de change. OmegaX le fait déjà, c'est le module
Réévaluation.

**Question B · exprimer les ÉTATS FINANCIERS dans une autre monnaie.**
C'est l'AUDCIF, Titre XII, **chapitre XII-4**. Rien à voir : ici on ne
retraite pas une opération, on retraduit un jeu d'états complet.

La première tentative de M2 a répondu à la question A en croyant répondre à la
question B · elle convertissait chaque ligne au cours de son jour, capital
compris. C'est faux, et le § 3 dit pourquoi.

## 2. Ce que dit le chapitre XII-4

**Section 1 · deux passages successifs, deux méthodes.**

| Passage | Méthode | Où va l'écart |
|---|---|---|
| monnaie **locale → fonctionnelle** | **temporelle** (coût historique) | **compte de résultat** |
| monnaie **fonctionnelle → présentation** | **cours de clôture** | **réserves consolidées** |

Le texte définit les trois monnaies : **locale** = monnaie de tenue de la
comptabilité ; **fonctionnelle** = monnaie de l'environnement économique
principal, « où la trésorerie est principalement générée et dépensée » ;
**présentation** = celle des états publiés.

**Notre cas est le premier passage.** La comptabilité est tenue en francs
congolais (loi n° 23/053 art. 141, 1° · AUDCIF art. 17, 1°), et le dollar est
la monnaie où beaucoup de nos dossiers encaissent et dépensent réellement.
Donc : **méthode temporelle**.

**Section 2 · la méthode temporelle, règle par règle.**

Objectif, cité : « aboutir aux mêmes états financiers que si les comptes
avaient été tenus directement dans la monnaie fonctionnelle ». C'est exactement
ce qu'un bailleur attend.

- **éléments monétaires du bilan** · cours de **CLÔTURE** ;
- **éléments non monétaires, Y COMPRIS LES CAPITAUX PROPRES**, évalués au coût
  historique · cours **HISTORIQUE**, celui de la date de comptabilisation
  initiale ;
- **produits et charges** · cours de la date de chaque transaction, en pratique
  cours moyen s'il en est proche, **SAUF les dotations aux amortissements et
  aux dépréciations**, qui prennent le cours de la date de comptabilisation
  initiale **de l'immobilisation** ;
- **le résultat n'est PAS converti** · « il est obtenu par différence entre
  actifs et passifs convertis pour équilibrer le bilan » ;
- l'**écart de conversion** est porté au **compte de résultat**, en poste
  distinct de charges ou de produits financiers.

**Ce qui est monétaire, et ce qui ne l'est pas** (définitions du texte) :

- **Monétaire** · liquidités, créances et dettes, provisions réglées en
  trésorerie. « Unités monétaires détenues et éléments à recevoir ou payer en
  un nombre déterminé ou déterminable d'unités. »
- **Non monétaire** · immobilisations incorporelles (écart d'acquisition
  compris), corporelles, financières ; amortissements ; montants payés
  d'avance ; stocks ; **capitaux propres**.

**Section 3 · la méthode du cours de clôture**, pour mémoire, puisqu'elle ne
s'applique pas à notre passage : actifs et passifs **hors capitaux propres** au
cours de clôture ; **capitaux propres au cours historique** ; charges et
produits au cours de clôture ou au cours moyen ; écart en réserves
consolidées.

Dans les DEUX méthodes, donc, **le capital ne bouge pas** · il reste au cours
auquel il est entré. L'intuition du praticien était juste, et elle vaut des
deux côtés.

## 3. En quoi la première tentative était fausse

Elle convertissait chaque ligne au cours du jour de son écriture. Résultat :

- **juste** pour les immobilisations, les stocks et le capital · une ligne
  d'acquisition convertie au cours de son jour EST le cours historique ;
- **faux** pour les créances, les dettes et la trésorerie · le texte veut le
  cours de **clôture**, pas celui de l'opération ;
- **faux** pour les dotations aux amortissements · elles doivent suivre le
  cours d'entrée de l'immobilisation, pas la date de l'écriture de dotation ;
- **faux** pour le résultat · il ne se convertit pas, il se déduit ;
- et elle ne produisait **aucun écart de conversion**, alors que la méthode en
  exige un, au compte de résultat.

Elle avait une propriété séduisante et trompeuse : comme les deux lignes d'une
écriture partagent la même date, elles partagent le même cours, et la balance
bouclait toujours. Un état qui boucle et qui est faux est pire qu'un état qui
refuse de sortir.

## 4. Ce que le texte ne dit PAS, et qu'il ne faut pas lui faire dire

Le chapitre XII-4 régit la conversion des états **d'une entité étrangère dans
une consolidation**. Notre cas est une entité unique qui veut une seconde
présentation, sans consolidation. Et l'article 3 du SYCEBNL **écarte les
articles 73 à 113 de l'AUDCIF**, c'est-à-dire tout le bloc des comptes
consolidés, pour les entités à but non lucratif.

Donc : la méthode temporelle est la **doctrine OHADA de référence**, et la
seule documentée, mais elle s'applique ici **par analogie**, pas par
obligation. Le second jeu reste un document de gestion sans valeur légale, et
il doit dire par quelle méthode il a été produit, pas seulement qu'il n'est pas
légal.

## 5. Ce que cela demande de construire

1. Une **classification monétaire / non monétaire** par compte, tirée des deux
   définitions ci-dessus et appliquée par racine de compte, à écrire une fois
   et à figer par un test. Elle diffère entre SYSCOHADA et SYCEBNL puisque les
   deux plans n'ont pas la même nomenclature.
2. Un **cours de clôture** par exercice, distinct des cours du jour · le module
   Réévaluation en manipule déjà un.
3. Le **rattachement des dotations à leur immobilisation**, pour prendre le
   cours d'entrée du bien et non celui de l'écriture de dotation. Le module
   Immobilisations porte déjà la date d'acquisition.
4. Le **résultat par différence**, et l'**écart de conversion** en poste
   distinct du résultat financier.
5. Le **cours moyen de l'exercice**, que le texte admet pour les produits et
   charges « s'il est proche du cours réel » · avec le contrôle qui dit s'il ne
   l'est pas, plutôt que de le supposer.

Aucun de ces cinq points n'est présent aujourd'hui. C'est un chantier, pas un
correctif.

## 6. LE SENS DU PASSAGE · correction du 2026-09-05

Le § 2 ci-dessus décrivait le passage monnaie locale vers monnaie
fonctionnelle. **C'est l'inverse qu'il faut outiller.**

En pratique, beaucoup d'entités congolaises tiennent leur comptabilité en
dollars ou en euros · c'est leur monnaie fonctionnelle, celle où la trésorerie
est réellement générée et dépensée. Les états déposés en RDC doivent être en
francs congolais. Le passage est donc **monnaie fonctionnelle (USD, EUR) vers
monnaie de présentation (CDF)**, et il relève de la **méthode du cours de
clôture**, Section 3, et non de la méthode temporelle.

C'est cette section qui pose « **capitaux propres (capital, réserves) : cours
historique** », et c'est bien ce que décrivait le praticien : le capital est
converti au taux auquel il est inscrit au bilan et y reste.

### Décisions de VMG, du 2026-09-05

**Le cours de clôture qui fait foi**, par ordre de disponibilité :

1. le **cours contractuel du bailleur**, quand la convention en fixe un ;
2. à défaut, le **cours BCC au 31 décembre** ;
3. à défaut, le **cours du dernier jour ouvré**.

Le logiciel doit donc dire, sur chaque état produit, LEQUEL des trois a été
retenu · un état converti sans dire à quel cours ne se vérifie pas.

**Un seul passage, jamais deux.** Une entité qui tient en euros convertit
directement en francs congolais. Le double passage EUR vers USD puis USD vers
CDF est abandonné : il ajouterait un écart de conversion sans ajouter aucune
information, et la monnaie de présentation exigée est le franc, pas le dollar.

## 7. Ce qui reste ouvert

**Deux des trois questions du § 6 initial sont tranchées** par les décisions
ci-dessus : le cours de clôture suit une hiérarchie, et le double passage est
abandonné.

Reste une seule question, et elle est en cours d'instruction sur les textes :

- **Le cours moyen est-il « proche du cours réel » ?** L'AUDCIF l'admet pour
  les charges et les produits, mais sous cette condition, et sans donner de
  seuil. Sur une monnaie qui a fortement bougé dans l'année, la moyenne simple
  ne l'est plus. La recherche en cours doit dire si un seuil chiffré existe
  quelque part · et si aucune source n'en donne, ce sera la réponse, et il
  faudra alors que VMG en fixe un et que l'état dise lequel.
