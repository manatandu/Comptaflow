# Notes de cours d'organisation comptable du CPCC · ce qu'OmegaX en tire

Note d'exploitation, 29 août 2026.

## 0. La source, et ce qu'elle est

**SHEKOMBO SHUNGU John, _Notes de cours d'organisation comptable_, Conseil
permanent de la comptabilité au Congo (CPCC), B.P. 308 Kinshasa I, novembre
2020.** Récupérée sur le Google Drive du dossier, environ 133 000 caractères,
sept chapitres.

C'est un cours congolais, écrit par le régulateur comptable congolais, sur la
seule question qu'aucun référentiel ne traite : **non pas quoi comptabiliser,
mais comment s'organiser pour le faire**. Le SYCEBNL dit ce qu'est un fonds
affecté ; ce cours dit qui impute, qui encode, qui vise, où la pièce est
classée, et à quelle date l'état part au CPCC.

Deux avertissements de méthode, avant tout le reste.

**Ce cours est écrit pour l'AUDCIF et le SYSCOHADA, pas pour le SYCEBNL.** Il
date de novembre 2020 ; le SYCEBNL n'est applicable que depuis le 1er janvier
2024. Quand il parle des « 36 notes annexes » du Système normal ou des trois
notes du SMT, il décrit les imprimés SYSCOHADA du CPCC, pas les jeux SYCEBNL
(35 notes pour les associations et ordres professionnels, 24 pour les projets
de développement, 5 pour le Système minimal de trésorerie). **Rien de ce qui
touche à la contexture des états n'a été repris d'ici.** Ce qui a été repris,
c'est l'organisation : elle, elle ne dépend pas du référentiel.

**Ce cours est congolais de bout en bout**, et c'est précisément sa valeur. Il
cite l'article 100 du décret n° 011/42 du 22 novembre 2011 sur les mentions
obligatoires de la facture, l'ordonnance n° 81-094 du 29 juin 1981, les
arrêtés d'astreinte de 2010 et 2013, le dépôt au CPCC et au RCCM. Aucune de
ces références n'existe dans un manuel Sage français, et aucune ne pouvait
être devinée.

---

## 1. Ce qui était déjà tiré de ce document

Le **chapitre 6, « Lettrage des comptes »**, a été exploité et livré avant
cette note (commit `fbcc8ff`). Il est la source du modèle de lettrage
professionnel qui a remplacé la numérotation naïve A, B, C.

Quatre phrases du cours ont commandé quatre décisions de conception :

| Le cours dit | OmegaX fait |
|---|---|
| « la somme des montants lettrés au débit pouvant être égale, **supérieure ou inférieure** à celle des montants lettrés au crédit » | Lettrage partiel de premier ordre · `StatutLettrage.PARTIEL` / `SOLDE`, et non un lettrage qui n'existe que soldé |
| « Le lettrage automatique peut être fait **a priori** ou **a posteriori** » | `OrigineLettrage.AUTOMATIQUE_PIECE` (rapprochement par numéro de pièce) et `AUTOMATIQUE_MONTANT` (par montant), plus `MANUEL` |
| « **verrouillage** définitif ou non du lettrage » | `Lettrage.verrouille` |
| « **liberté de définir la liste des comptes** auxquels s'applique le lettrage » | `Compte.lettrable`, cochable compte par compte dans le plan comptable, avec un défaut déduit du numéro |

Deux détails du chapitre 6 méritent d'être notés parce qu'ils confirment des
choix pris avant de l'avoir lu.

L'exemple chiffré du cours **ne porte pas sur un compte de tiers**, mais sur le
compte **585 « Virements caisse-banque »**. Le défaut d'OmegaX
(`estLettrableParDefaut`) ouvre le lettrage aux comptes de classe 4 **et aux
comptes 58** : c'est exactement le cas d'usage du cours, et ce n'est pas un
hasard, un virement interne non lettré est un virement en transit non
justifié.

Le cours écrit enfin que le lettrage « facilite également, pour les opérations
en monnaies étrangères dénouées, le calcul des **différences de change
réalisées** ». C'est le rôle de `Lettrage.ecartChange`, calculé sur les seules
lignes portant une devise quand le groupe est soldé en devise.

---

## 2. Ce que ce document a fait changer maintenant

Trois manques réels, tous les trois sourcés dans le cours, tous les trois
corrigés dans le même lot que cette note.

### 2.1 L'identité légale du dossier (§ 7.4, règle 7-a)

Le cours liste les mentions qui doivent figurer **sur chaque page** d'un état
financier déposé :

> « Au niveau de l'en-tête : Dénomination sociale de l'entreprise ; N°
> d'identification fiscale ; Exercice clos le ; Durée (en mois). »

OmegaX imprimait la dénomination et la période, jamais le numéro d'impôt ni la
durée, pour la raison simple que le dossier ne les connaissait pas. Le modèle
`Tenant` gagne donc `numeroImpot`, `idNat` et `rccm`, saisissables dans
Structure > Paramètres du dossier, et `EnteteImpression` les porte.

Les trois identifiants sont ceux d'une entité congolaise, pas d'une entité
française : le **numéro impôt** (NIF) de la DGI, l'**identification nationale**
et le **RCCM**. Une ASBL enregistrée en RDC les détient tous les trois, la note
circulaire n° 003/2013 du Ministère du Plan en faisant des pièces du dossier
d'enregistrement.

### 2.2 Le bloc de certification (§ 7.4, règle 7-b)

> « Dans l'encadré "certifié sincère et conforme aux règles du Système
> Comptable OHADA" : Nom ; Qualité ; Signature et date. »

Un état imprimé sans cet encadré n'est pas signable, donc pas déposable. Le
composant `BlocCertification` l'imprime au pied des états financiers, du SMT et
des notes annexes. Le libellé est adapté : « certifié sincère et conforme aux
règles du SYCEBNL » quand le dossier est en SYCEBNL, « du Système comptable
OHADA » quand il est en SYSCOHADA. La formule du cours n'a pas été recopiée
telle quelle, elle a été rendue exacte pour le référentiel du dossier.

### 2.3 Le planning de clôture (§ 2.3 et § 7.1)

C'est l'apport le plus substantiel du document.

> « La pratique largement observée veut que le Chef comptable propose d'abord
> au Directeur financier un planning de clôture. Celui-ci est un état
> prévisionnel des différents travaux à exécuter préalablement à la
> publication, sous la forme légale ou normalisée, des états financiers. »

Et, plus loin : « Compte tenu de l'impact financier et technique des travaux
d'inventaire extracomptable, le planning de clôture doit, avant sa mise en
application, obtenir le visa du top management. »

La fenêtre « Fin d'exercice » d'OmegaX savait clôturer, elle ne savait pas
**préparer** la clôture. Elle porte désormais le planning : seize jalons, soit
les dix étapes du § 7.1, les échéances légales congolaises du § 2.3 et du
§ 7.3, et trois obligations propres à une EBNL que le cours ignore (livre
d'inventaire de l'article 14, registre des donateurs des articles 17-18,
rapport d'activité de l'article 16-3). Chaque jalon est daté **à partir de la
date de clôture de l'exercice**, jamais de l'année civile : un exercice clos
au 30 juin décale tout le planning de six mois, et « fin avril » codé en dur
aurait donné une échéance déjà passée le jour de la clôture.

Cinq jalons ne sont pas de simples cases à cocher : OmegaX sait les vérifier
seul, et le fait. Le planning dit combien d'écritures traînent encore au
brouillard avant la balance, si le livre d'inventaire porte une transcription,
si le rapport d'activité existe, s'il reste des libéralités non signées au
registre des donateurs, et si l'exercice est clôturé. Un planning statique est
une affiche ; un planning qui sait qu'il reste douze écritures au brouillard
est un outil.

Ces échéances sont listées dans `src/modules/exercice/planning-cloture.ts`, avec
leur source et une date de dernière vérification, sur le modèle déjà retenu
pour les retenues à la source. Elles ne portent **aucun montant** : ni taux
d'astreinte, ni pénalité. Le cours cite bien deux arrêtés fixant des astreintes
par jour de retard (arrêté n° 024/CAB/MIN/FINANCES/2010 du 15 avril 2010 pour
le CPCC, arrêté interministériel n° 013/CAB/MINECO/2013 et
n° CAB/MIN/FINANCES/2013/1055 du 26 novembre 2013 pour le Ministère de
l'Économie), mais il n'en donne pas les taux, et un taux de 2013 non revérifié
n'a rien à faire dans un logiciel de 2026. Le planning nomme les textes et
laisse le chiffre au comptable.

---

## 3. Ce que le document valide, et qu'il aurait été coûteux de changer

Un document de référence sert autant à confirmer qu'à corriger. Quatre points
sur lesquels OmegaX était déjà juste, désormais adossés à une source.

**La clôture doit laisser passer le lettrage.** Le § 2.3 est catégorique :

> « La clôture interdit : l'ajout d'écriture, la modification de tous les
> composants des écritures comptables, la suppression d'une écriture
> comptable. La clôture autorise : **le lettrage et le pointage**, la
> consultation et l'édition. »

C'est déjà le comportement d'OmegaX : `EcritureService` refuse la création, la
modification et la suppression sur un exercice `CLOTURE`, et `LettrageService`
ne consulte pas le statut de l'exercice. Ce silence était un choix, il est
maintenant documenté comme tel dans le service, avec la citation. Un
rapprochement bancaire de janvier sur un exercice clôturé en mars reste
possible, et c'est bien ce que veut le cours.

**La composition d'une écriture.** Le § 2.6.2 énumère ce qu'une écriture
devrait porter : numéro d'ordre, date de valeur comptable, numéro de pièce
justificative (« facilite le lettrage »), comptes mouvementés, libellé,
montants, **unité budgétaire ou centre de frais**, **taux de change**. Les huit
sont présents dans `Ecriture` et `LigneEcriture`, les deux derniers via
`VentilationAnalytique` et `coursApplique`. Rien à ajouter.

**Un journal par compte bancaire.** Le § 4.2 conseille « d'avoir un journal par
compte bancaire et un journal par unité monétaire pour chaque caisse ». C'est
la règle qu'applique déjà le journal de trésorerie du SMT à l'export Excel, un
onglet par compte de trésorerie. Le conseil vaut d'être répété à
l'utilisateur ; il ne peut pas être imposé, une petite association tenant
souvent un seul journal de banque.

**La validation ne doit pas excéder le mois.** Le § 2.6.2 exige « une procédure
de validation ne pouvant excéder le mois au-delà de laquelle l'irréversibilité
des traitements effectués interdise toute suppression, addition ou
modification ultérieure », et « une procédure périodique dite de "clôture
informatique" **au moins trimestrielle** ». C'est la raison d'être du
brouillard et des trois granularités de clôture. Le planning de clôture reprend
ces deux cadences comme jalons récurrents.

---

## 4. Ce que le document propose et qui reste à faire

Rangé par rapport valeur sur coût, pas par ordre d'apparition dans le cours.

### 4.1 Le manuel des procédures, généré depuis le dossier

Le § 0.1.4 rappelle que **les articles 16 et 17 de l'AUDCIF imposent à toute
entité d'établir un manuel décrivant les procédures et l'organisation
comptable**, et que « la législation comptable de l'OHADA ne définit ni la
forme ni le contenu » de ce manuel. Il en donne ensuite le sommaire type :
organisation générale et comptable, plan comptable particulier, livres et
supports, états de sortie, organisation des travaux d'élaboration des états
financiers, classement et archivage, modèle d'instruction d'inventaire,
description des procédures.

Or **OmegaX connaît déjà les cinq premiers points** : il détient le plan de
comptes du dossier, ses journaux, ses utilisateurs et leurs rôles, ses modèles
de saisie, ses états. Un bouton « Éditer le manuel des procédures » qui
assemble ces éléments en un document imprimable, à compléter à la main pour ce
que le logiciel ignore (le circuit des pièces, les instructions d'inventaire),
transforme une obligation légale que presque personne ne remplit en une
formalité de dix minutes. C'est le plus fort effet de levier de tout le
document.

### 4.2 La fiche d'imputation, et la séparation imputation / encodage

Le § 2.6.1 est frontal :

> « L'imputation comptable est souvent confondue, à tort, avec la saisie
> comptable. La saisie consiste à traduire une opération en comptabilité tandis
> que l'imputation comptable se résume à choisir le(s) compte(s) approprié(s)
> concernés. »

Et : « Il n'est pas recommandé de confier le travail d'imputation comptable à
un comptable assistant. » Le cours décrit alors une **fiche d'imputation** avec
paraphe du préparateur et « Visa Chef comptable », qui matérialise la division
du travail : le chef comptable impute, l'assistant encode.

OmegaX a déjà le brouillard, qui sépare saisie et validation. Ce que le cours
décrit est différent et plus fin : il sépare **le choix des comptes** de
**l'encodage**. La brique manquante est une écriture pré-imputée sans
montants encodés, ou plus simplement l'impression d'une fiche d'imputation
depuis le brouillard, à faire viser avant validation. À évaluer contre le
public réel du logiciel : dans une association de cinq personnes, imputation et
encodage sont la même personne, et la fiche est du formalisme pur. Elle prend
son sens dans une ONG à antennes provinciales, qui est aussi le cas où les
pièces mettent trois semaines à remonter à Kinshasa.

### 4.3 Le folio structuré

Le § 2.6.2 propose une numérotation de folio parlante : « 23720080012 pour
signifier journal 237 "caisse Bunia USD", année 2020, mois d'août et folio
12 ». C'est une convention purement congolaise, faite pour retrouver une pièce
dans un classeur physique. Elle n'a de valeur que si OmegaX imprime le folio
sur le journal et que le classeur papier existe encore, ce qui est le cas
partout. Coût faible, à faire quand le journal imprimé sera repris.

### 4.4 Le matricule comme numéro de compte auxiliaire

Le § 5.4, en une phrase : « Lors de la création des comptes auxiliaires, il est
conseillé d'utiliser le numéro matricule. » S'applique aux comptes 42
(personnel). Une aide de saisie, pas une contrainte.

### 4.5 Le contrôle par rotation et sondage

Le § 2.3 décrit un contrôle périodique que le chef comptable exerce sur les
journaux auxiliaires, portant sur quatre points : concordance du solde du
journal auxiliaire avec le grand livre auxiliaire, rapprochement avec la
balance auxiliaire, conformité des libellés aux transactions, et
« confrontation des enregistrements correspondant à des sommes dépassant un
certain seuil avec ceux figurant sur les pièces justificatives ».

Les trois premiers sont des contrôles arithmétiques qu'OmegaX peut exécuter
seul et qui relèvent de la fenêtre « Analyse et contrôles ». Le quatrième est
un **échantillonnage au-dessus d'un seuil** : le logiciel peut tirer la liste,
l'humain confronte. C'est la forme d'audit interne la moins chère à outiller.

### 4.6 La force probante par réunion de pièces

Le § 1.2 pose une règle que peu de logiciels traduisent :

> « Une facture, même si elle respecte les conditions de forme, ne suffit pas
> pour justifier le paiement fait à un fournisseur. [...] Bref, le bon de
> commande, la facture et le bon de réception n'acquièrent de force probante
> que par cette réunion. »

Il ajoute que « la valeur probante des pièces justificatives d'origine interne
est inférieure à celle des pièces d'origine extérieure ». Traduit en logiciel :
une écriture d'achat ne devrait pas se contenter d'une `reference` unique, mais
pouvoir en porter plusieurs, typées et marquées interne ou externe. C'est une
évolution de modèle, pas un écran : à peser sérieusement avant de l'engager,
parce qu'elle touche la saisie, qui est le cœur chaud du logiciel.

Le même paragraphe rappelle les mentions obligatoires de la facture congolaise
au titre de l'**article 100 du décret n° 011/42 du 22 novembre 2011** : nom ou
raison sociale, adresse et **n° impôt** du vendeur et de l'acheteur, date,
**numéro de série** de la facture, désignation et quantité, prix unitaire et
global, sommes imposables et non imposables, prix hors TVA, **taux de TVA**,
montant TTC. C'est la liste que devra vérifier tout module de facturation, le
jour où il existera.

---

## 5. Ce qui est écarté, et pourquoi

**Les organigrammes comptables et les job descriptions (§ 0.1.1, § 0.1.2).**
Matière de gestion des ressources humaines. Ce qui en découle pour le logiciel
est déjà couvert par les rôles utilisateurs.

**Les développements sur l'internalisation contre l'externalisation de la
comptabilité (§ 2.2.1).** Décision de l'entité, antérieure au logiciel.

**L'organisation des locaux du service comptable (§ 2.2.2.1).** Hors sujet.

**Les trois systèmes de traitement (§ 2.4.1) : journal unique, journaux
divisionnaires, journaux auxiliaires.** Cette taxonomie décrit des
organisations papier. Un logiciel qui tient N journaux et centralise
automatiquement rend le choix sans objet : OmegaX est un système à journaux
divisionnaires, sans que ce soit un paramètre.

**Les postulats et conventions comptables (§ 2.5).** Repris du SYSCOHADA. Le
SYCEBNL a les siens, encodés dans le skill `sycebnl`, cadre conceptuel, Partie
1 chapitre 2. Aucune raison d'aller les chercher dans un cours de 2020.

**Le contenu des imprimés du CPCC (§ 7.3).** Décrit les imprimés SYSCOHADA. Les
jeux SYCEBNL n'ont pas la même contexture. Voir l'avertissement du § 0.

**Les règles de remplissage manuscrit (§ 7.4, règles 1 à 3) :** « remplis à
l'encre indélébile », « ni rature ni surcharge », cadrage à droite des nombres.
Écrites pour un imprimé rempli à la main. Les règles 4 à 7 de la même section,
elles, restent pertinentes pour un état imprimé et sont traitées au § 2
ci-dessus.

---

## 6. Point de vigilance sur les échéances

Les dates de dépôt du § 7.3 (DGI fin avril, Ministère de l'Économie mi-juin,
CPCC fin juin, RCCM le mois suivant l'approbation) proviennent d'un cours de
**novembre 2020**. Elles portent sur le dépôt des états financiers du Système
comptable OHADA en RDC. Trois réserves, écrites plutôt que tues :

1. Elles sont antérieures au SYCEBNL. L'obligation de dépôt d'une EBNL et le
   destinataire compétent n'ont pas été reverifiés sur texte primaire ; les
   textes congolais ne sont pas accessibles depuis cet environnement, comme
   déjà constaté dans `docs/fiscalite-asbl-rdc.md`.
2. Le cours signale lui-même une contradiction dans son propre corpus, entre
   les articles 11 et 13 de l'Acte uniforme sur le droit comptable quant à
   l'assujettissement des petites entités au Système minimal de trésorerie. Ce
   n'est pas une erreur de transcription, c'est le texte.
3. La date fiscale d'avril concerne une déclaration d'impôt sur les bénéfices
   qui, depuis la loi n° 23/053, n'existe plus sous ce nom.

D'où le choix retenu dans `planning-cloture.ts` : les échéances y figurent avec
leur source nominative et une date de dernière vérification, présentées comme
des **jalons indicatifs à confirmer**, jamais comme une obligation opposable
calculée par le logiciel. Le comptable qui les lit sait d'où elles viennent et
de quand elles datent.
