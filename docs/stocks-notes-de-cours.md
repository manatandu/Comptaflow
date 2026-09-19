# Stocks · ce que les notes de cours apportent, et ce qu'elles n'autorisent pas

Source lue le 2026-09-19 · **LIVRE DE COMPTABILITÉ GÉNÉRALE**, chapitre 10
« Les comptes du cycle d'exploitation », section 10.1 « Comptes de stocks »
(pages 109 à 126), lue intégralement, exercices d'application compris.

## 0. Le statut de ce document, et c'est la première chose à écrire

**Ce livre n'est pas une source au sens de la règle n°1 du dépôt.** C'est une
note de cours : elle commente le Système comptable OHADA, elle ne le promulgue
pas. Les sources restent l'Acte uniforme (compétence `audcif-acte-uniforme`),
le SYSCOHADA (`syscohada`) et le SYCEBNL (`sycebnl`).

Ce qui suit se lit donc en trois colonnes, et jamais autrement :

- ce que le livre **CONFIRME** d'une règle déjà lue au texte officiel · alors
  le livre est un témoin de plus, et c'est tout ;
- ce que le livre **AJOUTE** et que le texte officiel n'a pas encore été lu
  pour vérifier · alors c'est une PISTE, à confronter avant toute ligne de
  code ;
- ce que le livre **DIT DE TRAVERS** · et il y en a, y compris dans ses
  chiffres.

## 1. Ce que le livre confirme, et qui était déjà codé

**Les méthodes de valorisation.** « Le Système Comptable OHADA préconise deux
méthodes d'évaluation des stocks suivantes : le Coût Unitaire Moyen pondéré
(CUMP) avec deux variantes, à savoir le CUMP après chaque entrée et le CUMP en
fonction de la durée moyenne de stockage ; le FIFO ou PEPS. » Ce sont, comptées
en deux familles, exactement les TROIS méthodes que le glossaire de l'AUDCIF
(Titre VI, « valorisation des biens fongibles ») retient sur cinq. Le livre ne
nomme ni le coût moyen pondéré ANNUEL ni le D.E.P.S. · `METHODES_ADMISES` est
confirmée par une seconde plume.

**L'appariement méthode / mode de tenue.** Le livre range le CUMP après chaque
entrée en « variante utilisée en inventaire permanent » et le CUMP sur durée
moyenne de stockage en « variante utilisée en inventaire intermittent ». C'est
la phrase du glossaire, et c'est `methodeCompatible()`.

**La forme de la fiche.** Dates | Mouvements | ENTRÉE (Q, CU, Montant) | SORTIE
(Q, CU, Montant) | STOCKS (Q, CU, Montant), une ligne TOTAUX, puis des
vérifications. En P.E.P.S., la colonne STOCKS porte **une ligne par couche**
(au 07/01 : 8 à 32 et 10 à 34, l'une sous l'autre). C'est la présentation que
la fiche Excel d'OmegaX construit, et le livre la valide.

**L'égalité de contrôle**, qu'il écrit en toutes lettres et en deux dimensions :
« Stocks initial (S.I) + Total des entrées · Total des sorties = Stocks Final
(S.F) », *en quantité* PUIS *en valeur*. Le dépôt ne portait que la valeur ;
la quantité a été ajoutée à la fiche du même geste.

**Les deux inventaires**, définis comme les deux textes les définissent, et les
écritures de variation dans les deux régimes : en permanent, entrée
`3x` par `603x` et sortie `603x` par `3x`, avec deux écritures de régularisation
des différences d'inventaire en plus et en moins ; en intermittent, constatation
du stock final et annulation du stock initial, ce que `proposerVariations()`
produit sous forme BRUTE, comme le livre.

## 2. Ce que le livre ajoute · les EMBALLAGES

C'est la matière que le dépôt ne portait pas du tout, et la raison de la
lecture.

**La taxonomie, en deux branches qui ne vivent pas dans la même classe.**

- Le **matériel d'emballage** (compte 243) est « destiné à être utilisé de
  manière durable pour les besoins de l'entité et non livré aux clients »
  (citernes, cuves, silos). C'est une IMMOBILISATION, pas un stock.
- Les **emballages commerciaux** (compte 335) sont un stock, et se divisent en
  emballages perdus, emballages récupérables non identifiables, et emballages à
  usage mixte.
- **Emballage récupérable** : « prêté ou consigné aux clients », livré « à titre
  provisoire », il « n'est pas vendu avec [la marchandise] et reste la propriété
  du fournisseur ».
- **Emballage perdu** : sa « valeur est incorporée au prix du contenu ».

**La consignation est la seule particularité du cycle**, et le livre le dit :
« Les comptes relatifs aux emballages fonctionnent de la même manière que ceux
relatifs aux marchandises et matières. La seule particularité concerne la
consignation. » Elle se tient en miroir, chez le client et chez le fournisseur,
et elle ne passe par AUCUN compte de produit tant que l'emballage peut revenir :
c'est une créance d'un côté (4094) et une dette de l'autre (4194). Trois
dénouements, et ils ne se comptabilisent pas pareil :

1. **retour au prix de consignation** · les deux écritures s'extournent, rien
   n'entre au résultat ;
2. **conservation par le client** · il y a vente : le client achète (6082) et
   le fournisseur constate un produit (7074, « Bonis sur reprises et cessions
   d'emballages ») ;
3. **déconsignation à un prix INFÉRIEUR au prix de consignation** · l'écart est
   une charge chez le client (6224 « Malis sur emballages ») et un produit chez
   le fournisseur (7074).

Un quatrième cas est distingué du deuxième, et la nuance est réelle :
l'emballage non restitué **et perdu**, que le livre porte en charge chez le
client au lieu d'un achat, puisqu'il n'entre dans aucun stock.

**RIEN DE TOUT CELA N'EST CODÉ, ET RIEN NE DOIT L'ÊTRE DEPUIS CE LIVRE.** Voir
le § 4 : la confrontation au plan semé a trouvé une divergence qui aurait fait
imputer une association sur un compte qu'elle n'a pas.

## 3. Ce que le livre ajoute et qui reste une PISTE

**Le compte 38, et ce que le dépôt n'en savait pas.** Les contrôles de
minoration du dépôt connaissent le 38 comme « stocks en cours de route, en
consignation ou en dépôt ». Le livre développe une subdivision que le module ne
traite nulle part : **388 « Stocks provenant d'immobilisations, mises hors
service ou au rebut »**, qui reçoit les matières et matériaux récupérés sur une
immobilisation démantelée (`388` par le crédit du `603`), puis se ventile dans
les comptes de stocks appropriés. Le livre ajoute que « en fin d'exercice, le
compte 388 est soldé par le compte 603 ». Cela touche à la fois le module des
stocks et celui des immobilisations (sortie d'immobilisation). **À confronter
au Titre VII de l'AUDCIF et à la fiche du compte 38 avant tout code** · et à
lire dans les DEUX plans, le 38 du SYCEBNL étant « dons en nature H.A.O. ».

**Le coût moyen de période de stockage, dont le moteur déclare ne pas savoir le
calculer.** `valorisation-stocks.ts` refuse cette méthode avec
`METHODE_NON_IMPLEMENTEE`, au motif que sa définition au glossaire suppose « la
DATE D'ENTRÉE MOYENNE du stock existant en fin d'exercice », donnée qu'OmegaX
ne tient pas. Le livre propose une autre route, entièrement calculable :

    stock moyen            = (stock initial + stock final) / 2   [en quantités]
    rotation               = total des sorties / stock moyen
    durée moyenne          = durée de la période / rotation
    valeur du stock final  = stock final x coût moyen des entrées
                             des « durée moyenne » derniers jours

**LE REFUS N'EST PAS LEVÉ**, et pour trois raisons qui tiennent chacune seule.
Cette route n'est pas celle du glossaire : une durée moyenne d'ÉCOULEMENT
déduite d'une rotation n'est pas une date d'entrée moyenne, et rien ne dit que
le texte admette la substitution. Elle suppose en outre des ENTRÉES datées,
c'est-à-dire précisément ce qu'un dossier en inventaire intermittent ne saisit
pas, alors que cette méthode est la sienne. Et l'exemple du livre ne tient pas
debout (voir § 5). La piste est notée, la confrontation au texte reste à faire.

## 4. Ce que la confrontation au plan semé a trouvé · le cycle qui coïncide, et le bout qui diverge

Le cycle des stocks est, au dossier, la plus grande occurrence du premier piège
du dépôt : sur quatorze numéros, DOUZE changent de sens entre les deux plans.
Le réflexe était donc d'attendre la même chose des emballages. **Les deux semis
disent le contraire, et il fallait aller les lire.**

**Dix numéros sur douze sont IDENTIQUES dans les deux plans**, même numéro et
même intitulé · `33510000` emballages perdus, `33520000` récupérables non
identifiables, `33530000` à usage mixte, `33580000` autres emballages ;
`60810000`, `60820000`, `60830000`, `60850000` frais sur achats ; `62240000`
malis sur emballages, `62250000` locations d'emballages ; `40940000` créance
pour emballages à rendre, `41940000` dette pour emballages consignés ; et,
côté immobilisation, `24300000`, `28430000`, `29430000`. C'est le premier cycle
du dépôt où l'essentiel de la nomenclature se recouvre.

**LA DIVERGENCE EST AU BOUT PRODUIT, ET C'EST JUSTEMENT LÀ QUE LE CYCLE SE
DÉNOUE.** Les deux comptes par lesquels le fournisseur constate son produit
n'existent QU'AU SYSCOHADA :

| Le livre écrit | SYSCOHADA (semé) | SYCEBNL (semé) |
|---|---|---|
| `7071` Vente emballages | `70710000` Ports, emballages perdus et autres frais facturés | néant |
| `7074` Bonis sur reprises et cessions d'emballages | `70740000` Bonis sur reprises et cessions d'emballages | néant |
| `6588` Emballages à rendre perdus | `65880000` **Autres charges diverses** | néant (un seul `65800000` Charges diverses) |

Le SYCEBNL ne subdivise pas son 707 : il n'ouvre qu'un `70700000` « Produits
accessoires ». Une écriture de déconsignation servie sans regarder le
référentiel enverrait donc une association sur un compte qui n'existe pas dans
son plan · et l'écriture serait refusée à la saisie APRÈS coup, comme le 734 et
le 735 du chantier précédent. Pire pour le `6588` : le numéro EXISTE au
SYSCOHADA sous un TOUT AUTRE intitulé, « Autres charges diverses ». Un
emballage perdu y serait comptabilisé sans qu'aucune balance ne cesse de
boucler, et la Note annexe publierait « Autres charges diverses ».

**Règle qui en sort, et elle prolonge celle du chantier des stocks · aucun
numéro d'emballage ne s'écrira ailleurs que dans une table nommée, et aucun
sans son référentiel.** Le numéro 707 rejoint la liste du dépôt : dix-huitième
occurrence de « un numéro, deux sens », après le 192, le 4181, le 1061/1062, le
38/37, le 397, le 70510000, le 601, le 7041, les deux articles 11, les trois
« trois exercices » et les deux textes n° 23/10.

## 5. Les anomalies du livre, signalées et non corrigées

Aucune n'est reprise, et aucune n'est corrigée en silence.

1. **L'exemple d'application est un trimestre habillé en mois.** L'en-tête des
   deux fiches porte « MOIS : Mai », l'énoncé dit « pendant le mois de Mai », et
   les neuf mouvements sont datés du 01/01 au 31/03. La variante B calcule
   ensuite sur « 90 jours » et conclut que « le stock tourne en moyenne 2,25
   fois LE TRIMESTRE ». Le calcul est cohérent avec un trimestre, l'énoncé avec
   un mois.
2. **L'unité change en cours d'énoncé.** « Un stock initial de 8 cartouches à
   32 CDF LA CARTOUCHE », puis « 10 cartouches au prix de 34,50 CD LA BOÎTE »,
   puis des sorties « de 5 BOÎTES ». Les fiches traitent les deux comme une
   seule unité.
3. **Le prix du 07/01 est faux dans l'énoncé.** Il y est écrit 34,50 ; les deux
   fiches valorisent à 34, et c'est 34,50 qui est le prix du 18/02. Les fiches
   sont cohérentes, l'énoncé ne l'est pas.
4. **L'écriture de stockage de la page 117 ne s'équilibre pas** : `321` débité
   de 30 100 000 par `6032` crédité de **31 100 000**, sur un achat de
   30 000 000 et 100 000 de transport. Le débit est juste.
5. **La page 116 étiquette « En I.P. » deux blocs successifs**, le second étant
   l'inventaire INTERMITTENT (il ne porte aucune écriture de stock).
6. **La page 122 intitule « Constatations du Stock final » une écriture
   narrée « (Pour annulation du stock final) »**, et y crédite `60335` là où
   l'écriture jumelle d'annulation du stock initial utilise `6033`.
7. **Le compte 388 est décrit comme « soldé par le DÉBIT du compte 603 »** alors
   que le schéma d'écriture donné juste après le débite par le crédit du 603.
8. Deux arrondis incohérents dans la fiche CUMP · `34,036` sur une ligne où le
   coût unitaire vaut `34,037` partout ailleurs, et `165,56` pour `165,555`.

Les deux fiches ont été recalculées mouvement par mouvement : **hors ces
coquilles de présentation, l'arithmétique des deux méthodes est juste**
(sorties 909,86 et stock final 556,14 en CUMP ; 906,50 et 559,50 en P.E.P.S. ;
256 + 1 210 moins les sorties redonne bien le stock final dans les deux cas).

## 6. Ce que cette lecture change, et ce qu'elle ne change pas

**Change** · la fiche Excel porte désormais la vérification en QUANTITÉ à côté
de celle en valeur, parce que le livre la pose en deux dimensions et que c'est
la moitié qui manquait.

**Ne change pas** · le refus du coût moyen de période de stockage, la table
`nomenclature-stocks.ts`, et les trois refus de `variation-stocks.ts`. Une note
de cours ne lève aucun refus posé sur un texte officiel.

**Reste à faire, et dans cet ordre** · lire les fiches des comptes 33, 40, 41,
60, 62 et 70 dans les DEUX textes officiels avant d'ouvrir quoi que ce soit sur
les emballages ; lire la fiche du compte 38 sur le sous-compte 388.
