# Paie P1 · le registre du personnel (2026-09-19)

## 0. Ce que P1 fait, et ce qu'il continue de ne pas faire

P1 ouvre **trois tables** (`Salarie`, `EnfantACharge`, `ContratTravail`), une
fenêtre, et une **confrontation**. Il ne calcule **aucun bulletin, aucune
assiette, aucun montant de paie**. P0 a établi que le moteur bute sur des
textes qui ne sont pas au corpus, et la passe de recherche du même jour n'en a
levé aucun : elle les a identifiés, pas versés.

**CE QUI REND P1 POSSIBLE MALGRÉ CELA**, et c'est le vrai gain : le registre ne
dépend d'aucun des textes manquants. Il dépend de la **loi n° 015/2002 portant
Code du travail**, qui est au corpus, intégrale, article par article.

---

## 1. L'ARTICLE 212 EST LE SCHÉMA

Le module n'a pas été dessiné puis justifié. Il a été **lu**.

> **Article 212** · Le contrat de travail constaté par écrit doit comporter, au
> minimum, les énonciations ci-après : […]

Quinze points. Et l'article 44 les rend opposables :

> Le contrat de travail doit être constaté par écrit et rédigé dans la forme
> qu'il convient aux parties d'adopter **pour autant qu'il comporte les
> énonciations visées à l'article 212**.

`ENONCIATIONS_ARTICLE_212` porte les quinze, numérotées comme le texte les
numérote, avec leur libellé verbatim et l'écran où les renseigner. Un test
compte quinze et vérifie la numérotation de 1 à 15 sans trou : **la liste est
celle du législateur, pas celle du logiciel.**

### Quatre lectures que le texte impose et qu'on aurait ratées

1. **Le point 2 est du côté de l'EMPLOYEUR.** « le numéro d'immatriculation de
   l'employeur à l'INSS ». Une fiche de salarié parfaite ne suffit pas · tant
   que le dossier n'a pas saisi ce numéro, **aucun** de ses contrats n'est
   complet. Le champ n'existait pas : il a été ouvert sur `Tenant`, et câblé
   jusqu'à l'écran des paramètres, parce qu'un renvoi vers un champ absent est
   le trou du câblage.
2. **Le point 5 prévoit lui-même la date inconnue** · « la date de naissance
   du travailleur **ou à défaut, le millésime de l'année présumée** ». Deux
   colonnes, et l'une OU l'autre satisfait le contrôle. Exiger la date pleine
   serait plus sévère que la loi.
3. **Le point 7 n'exige pas un conjoint.** Il énumère ce qu'il faut mentionner
   SI cela existe. Le lire comme une exigence ferait échouer tout contrat de
   célibataire, et le contrôle deviendrait du bruit qu'on apprend à ignorer. Ce
   qui manque vraiment, c'est un enfant DÉCLARÉ sans sa date de naissance, que
   le texte réclame de chacun.
4. **Un CDI a une durée** · le point 11 vise « la durée de l'engagement », et
   l'indétermination en est une. Réclamer un terme à un contrat à durée
   indéterminée reviendrait à lui demander de cesser d'en être un.

---

## 2. LES REQUALIFICATIONS NE SONT PAS DES AVIS

Le Code n'écrit pas « il serait préférable ». Il écrit **« de plein droit »**,
**« est réputé »**, **« constituent de plein droit l'exécution d'un contrat de
travail à durée indéterminée »**.

| Article | Ce qui déclenche | Effet |
|---|---|---|
| art. 44 al. 2 | pas d'écrit (sauf jour le jour, al. 3) | présumé CDI, **jusqu'à preuve du contraire** |
| art. 45 | aucune des trois formes de l'art. 40 | réputé CDI |
| art. 42 | emploi permanent en CDD | réputé CDI |
| art. 41 al. 1er | CDD > 2 ans, ou > 1 an si séparé de sa famille | CDI |
| art. 41 al. 2 et 3 | plus de deux CDD, ou plus d'un renouvellement | CDI de plein droit |

**LE LOGICIEL NE REQUALIFIE RIEN EN BASE.** Il dit que le texte l'a déjà fait.
Changer le type serait décider à la place du juge ; le taire serait laisser un
dossier croire qu'il tient un CDD.

Chaque requalification porte **son article ET la formule du texte**, et un test
l'exige : c'est la formule qui distingue un conseil d'un effet légal.

### Deux exceptions que le texte pose et qu'il fallait poser aussi

- **L'engagement au jour le jour échappe à l'écrit** (art. 44 al. 3). Le
  traiter comme les autres ferait réclamer un écrit que la loi n'exige pas, sur
  la forme d'emploi la plus courante.
- **L'apprentissage relève du Titre III** (art. 18 à 35). Les art. 41 et 42 ne
  le visent pas · le compter parmi les CDD ferait naître une requalification
  qu'aucun texte ne porte.

---

## 3. LE JEU D'ESSAI S'EST CHERCHÉ, ET LA PREMIÈRE FOIS IL N'A RIEN PROUVÉ

Sept défauts ont été réinjectés dans la règle. **Six ont été attrapés. Le
septième est passé.**

Le défaut : compter le plafond de l'art. 41 en **730 jours** au lieu de le
compter **de date à date**. Mon jeu d'essai était un CDD du 5 janvier 2026 au
5 janvier 2028. Il ne contient **aucun 29 février** : il dure exactement 730
jours, et les deux lectures rendent le même verdict. Le commentaire du test
affirmait le contraire (« 2028 est bissextile ») · c'est l'année de FIN qui est
bissextile, pas la période, et le 29 février 2028 tombe après le terme.

Le jeu refait : du **5 janvier 2027 au 5 janvier 2029**. Il enjambe le
29 février 2028, dure **731 jours** et pourtant **exactement deux ans**. C'est
le seul cas où les deux lectures divergent. Le défaut est alors tombé.

**Même leçon que pour le mali de stock, et il a fallu la réapprendre :
un jeu d'essai se CHERCHE quand il doit porter une propriété numérique.**

---

## 4. LES PREMIÈRES DONNÉES PERSONNELLES DU DÉPÔT

Date de naissance, nationalité, nom du conjoint, nom des enfants, numéro
d'affiliation, rémunération. Rien de tel n'existait dans OmegaX.

Les trois tables entrent au **journal d'audit** · c'est la RETOUCHE qui
compte : une date d'entrée en vigueur reculée, un type passé de CDD à CDI, une
date de fin déplacée changent une ancienneté ou une requalification, et rien
d'autre n'en garderait la trace.

Et elles entrent avec une **liste d'exclusion nommée colonne par colonne**. On
garde la CLÉ, on masque la VALEUR : savoir QUE la date de naissance a changé
fait partie de la trace, la connaître n'en fait pas partie.

| Reste lisible au journal | Masqué |
|---|---|
| nom, matricule, sexe · sans quoi le journal ne dit plus DE QUI il parle | date de naissance, millésime, lieu de naissance, nationalité, conjoint, n° CNSS |
| dates de déclaration, aptitude, `actif` · faits de GESTION | nom, post-nom, prénoms et date de naissance de chaque enfant |
| type de contrat, dates, permanence · c'est la requalification | rémunération de base, avantages convenus |

### ET C'EST LÀ QUE P1 A TROUVÉ UN DÉFAUT QU'IL NE CHERCHAIT PAS

`colonnesDuModele()`, qui construit l'**archive de restitution du dossier**,
lisait **la liste d'exclusion du journal d'audit**.

Tant que cette liste ne contenait que `motDePasse` et `estOperateurPlateforme`,
les deux usages coïncidaient, et personne ne voyait qu'ils étaient confondus.
Le registre du personnel les a séparés : y verser la date de naissance et la
rémunération aurait, **du même geste, vidé l'archive** de ce qu'elle existe
pour rendre. Un dossier n'aurait plus pu reconstituer son propre registre, et
l'archive se serait dite complète.

**Le socle qui ne peut pas mentir aurait menti.**

Deux listes désormais, et un test qui les tient séparées :
- `COLONNES_EXCLUES_PAR_MODELE` · ce qu'un JOURNAL lu par tout le dossier ne
  recopie pas ;
- `COLONNES_JAMAIS_RESTITUEES` · ce qui n'appartient PAS au dossier, et cela
  seul : l'empreinte d'un mot de passe et le drapeau de l'exploitant.

**Doctrine qui en sort · une liste d'exclusion se nomme par sa FIN, jamais par
sa forme. Deux listes identiques qui protègent deux choses différentes sont
deux listes, pas une.**

---

## 5. L'EFFECTIF EST PROPOSÉ, JAMAIS SUBSTITUÉ

Trois endroits attendaient un effectif, et tous trois le SAISISSAIENT :
`Tenant.effectifPermanent`, les notes 27B (SYSCOHADA) et 29B (SYCEBNL), et
`AccordCadrePlan.partMainOeuvreLocale` (les 60 % de main-d'œuvre locale de
l'art. 37, point 4 de la loi n° 004/2001).

Le schéma disait même, à propos du dernier : « OmegaX n'a pas de module de
paie · aucun effectif, aucune nationalité, aucun contrat ». **Ce n'est plus
vrai.** La tentation était de basculer au calcul.

**P1 ne bascule pas.** Le registre PROPOSE un effectif à une date, avec sa
source nommée (« Registre du personnel au JJ/MM/AAAA ») · la valeur saisie
reste la valeur. Et la part de main-d'œuvre nationale est rendue **nulle dès
qu'une seule nationalité manque au registre** : un pourcentage tiré d'un
registre incomplet serait faux sous une apparence de calcul, sur un engagement
d'accord-cadre dont le manquement se sanctionne.

**Une source saisie et assumée vaut mieux qu'un calcul qui ne sait pas ce qu'il
ignore.**

---

## 6. L'ASYMÉTRIE DE SEMIS, TRANCHÉE

P0 l'avait laissée à décider : le semis SYCEBNL ouvrait `43340000` (INPP) et
`43350000` (ONEM), le semis SYSCOHADA non, alors que
`correspondance-retenues.ts` pointe les deux clés vers `4334` et `4335` **pour
les deux référentiels**. Une société commerciale n'avait aucun compte où porter
deux cotisations qu'elle doit, et le registre des retenues lui rendait un état
**sans ligne** · ce qui se lit « rien à reverser ».

**Tranché : les deux comptes sont ouverts dans le semis SYSCOHADA aussi.** La
raison est dans les textes, pas dans la symétrie pour elle-même : l'INPP naît
des articles 8 à 17 du Code du travail, l'ONEM de ses articles 202 et suivants,
et ni l'un ni l'autre ne distingue une ASBL d'une SARL. Le plan SYSCOHADA est
RÉGIONAL et ne nomme aucun organisme congolais · les deux subdivisions sont
ouvertes par le logiciel et déclarées comme telles, exactement comme en
SYCEBNL.

---

## 7. DEUX ARTICLES 37, ET ILS SE TOUCHENT ICI

L'**art. 37 du Code du travail** frappe de nullité toute clause moins favorable
au travailleur que le Code. L'**art. 37 de la loi n° 004/2001**, point 4, impose
à une ONG d'employer 60 % de main-d'œuvre locale.

Les deux vivent désormais dans la même fonctionnalité : le registre applique le
premier, et alimente le second. **Vingt-et-unième occurrence** de la famille
« un même numéro, deux sens » dans le dépôt, et la première où les deux sens se
touchent dans une seule page.

---

## 8. Les garde-fous qui ont servi sans qu'on les appelle

Quatre, dans cette seule passe :

1. **Le compte de modèles de la restitution** · 79 → 82. Il a obligé à classer
   chacune des trois tables par la borne qui la lit.
2. **La liste des modèles cloisonnés** · elle relit `schema.prisma` et est
   tombée jusqu'à ce que les trois y soient.
3. **La liste d'exclusion fermée** · elle a obligé à classer, colonne par
   colonne, les cinquante colonnes des trois modèles. C'est en la remplissant
   que la confusion des deux listes est apparue.
4. **Les grilles à 360 px** · la grille à deux colonnes de la fenêtre fait
   748 px et n'était pas dans un conteneur qui défile.

Aucun de ces quatre n'a été écrit pour P1. Tous quatre ont travaillé pour lui.

---

## 9. Ce que P1 laisse à P2

- **Le moteur de bulletin** attend toujours le **décret n° 25/22**, annexe de
  tension salariale comprise.
- **La catégorie professionnelle** est une chaîne libre · la convention
  collective du dossier n'est pas au corpus, et l'art. 114 comme le barème de
  préavis raisonnent par catégorie.
- **Le motif de fin de contrat** est une chaîne libre, délibérément : le Code
  distingue l'arrivée du terme, la résiliation pour motif valable (art. 62), la
  faute lourde (art. 72), le licenciement économique (art. 78) et la force
  majeure, chacun avec des conséquences différentes sur le décompte final.
  Figer une liste reviendrait à trancher P4 avant de l'avoir lu.
- **L'art. 218** (déclaration annuelle de la main-d'œuvre nationale et
  étrangère, et bilan social) est identifié mais pas porté à l'échéancier.
- **Le livre de paie** des art. 213 à 215, avec son modèle fixé par arrêté
  ministériel, est de P3.

---

# ADDENDUM P1b · la classe, et le contrat confronté au minimum légal

P1 laissait `categorieProfessionnelle` en chaîne libre, au motif que « tant que
la convention collective du dossier n'est pas au corpus, rien ici n'en déduit de
montant ». **Ce motif ne vaut plus qu'à moitié.** La convention du dossier reste
absente, mais la **grille de tension salariale du décret n° 25/22 est arrivée**,
et elle fixe un minimum par classe.

## Deux colonnes, et elles ne se confondent pas

| Colonne | D'où elle vient | Ce qu'elle commande |
|---|---|---|
| `categorieProfessionnelle` | la **convention collective** du dossier | le préavis de l'art. 64, la quotité saisissable de l'art. 114 |
| `classeProfessionnelle` | le **décret n° 25/22**, annexes, 1 à 17 | le taux journalier MINIMUM |

Les fondre ferait servir un barème légal sous un nom conventionnel, ou
l'inverse. Un test l'exige : une catégorie conventionnelle renseignée ne
renseigne pas la classe.

## Le contrôle, et ce n'est pas un avis

> **Décret n° 25/21, art. 3** · le SMIG est « la somme minimale fixée par le
> pouvoir public **en deçà de laquelle aucun travailleur ne peut être rémunéré
> sous peine de sanction** ».
>
> **Code du travail, art. 37** · « Toute clause contractuelle accordant au
> travailleur des avantages inférieurs à ceux prescrits par le présent Code est
> **nulle de plein droit**. »

La confrontation rend donc, pour chaque contrat, le minimum de sa classe et le
manque quand il y en a un.

## TROIS CHOSES SANS LESQUELLES IL S'ABSTIENT, ET LE DIT

1. **La classe** · on ne la déduit ni de l'intitulé du poste, ni de la catégorie
   conventionnelle.
2. **La périodicité de la rémunération** · nouvelle colonne, et elle est
   indispensable. Le décret fixe un taux JOURNALIER ; la supposer mensuelle
   ferait paraître un salaire journalier **vingt-six fois trop bas**, et un
   salaire annuel douze fois trop haut. Un test pose le cas : 21 500 FC est
   exactement le minimum journalier de la classe 1 et très au-dessous du minimum
   mensuel · le même nombre est conforme ou fautif selon l'unité.
3. **Le mois de référence.** Un contrat TERMINÉ se juge sur son dernier mois ·
   le confronter au minimum d'aujourd'hui reprocherait à l'employeur une
   revalorisation postérieure au départ du salarié. Un contrat EN COURS se juge
   au mois courant, parce que c'est ce qu'un inspecteur regarde.

**Et `conforme` vaut `null` quand il s'abstient, jamais `true`.** Une abstention
muette se lirait comme un contrat conforme.

## Le piège que le contrôle rend visible

**Le minimum a changé en janvier 2026.** 500 000 FC par mois était conforme de
mai à décembre 2025 (14 500 × 26 = 377 000) et ne l'est plus en janvier 2026
(21 500 × 26 = 559 000). **Un contrat conforme à sa signature cesse de l'être
sans que rien n'ait bougé au contrat**, et l'art. 11 du décret n° 25/21 programme
un ajustement chaque janvier. Un test fige ce basculement.

**L'autre contresens, plus coûteux** : contrôler tout le monde contre les
21 500 FC du manœuvre ordinaire. Le dernier échelon du cadre de collaboration
est à 215 000 FC par jour, **dix fois plus**.

## Ce que le contrôle ne fait pas

Il compare la rémunération **convenue au contrat**, pas ce qui est payé · un
bulletin est de P2. Et il ne tient aucun compte des avantages en nature, que
l'article 8 du décret n° 25/22 exclut expressément de la rémunération pour le
logement et le transport.

## Au journal d'audit

Les deux colonnes sont **admises**, pas masquées, et pour une raison précise :
rétrograder quelqu'un d'une classe après coup **abaisse le minimum qui lui est
opposable**. C'est exactement la retouche qu'un journal existe pour rendre
visible · la masquer protégerait la manipulation, pas la personne. La
périodicité suit, parce qu'elle est l'unité et non le montant, lequel reste
masqué.

Six contresens réinjectés, six attrapés. Le garde-fou de la liste d'exclusion
fermée a servi une fois de plus, sans qu'on l'appelle.
