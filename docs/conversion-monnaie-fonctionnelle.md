# Conversion en monnaie fonctionnelle · ce que le texte impose

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

## 6. Ce qui reste à trancher, et que je ne tranche pas

- **Le cours moyen est-il « proche du cours réel » ?** Le texte pose la
  condition sans donner de seuil. Sur une monnaie qui a bougé fortement dans
  l'année, la moyenne simple ne l'est pas. À quel écart faut-il refuser le
  cours moyen et exiger le cours de chaque transaction ?
- **Quel cours de clôture** fait foi · celui de la BCC au 31/12, celui du
  dernier jour ouvré, un cours contractuel de bailleur ? Le texte dit « dernier
  cours de change à la date de clôture » pour les créances et dettes, sans
  nommer la source.
- **Le double passage EUR/CDF puis EUR/USD** que vous évoquiez est bien le
  schéma à deux passages du texte · reste à savoir si le second passage se fait
  au cours de clôture (méthode de la Section 3) ou en repartant des francs.
