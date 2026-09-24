# Paie P3 · la passation comptable

Journal du 2026-09-19. Compétences mobilisées : `sage-i7` (pattern de passation),
les deux semis du dépôt comme source de vérité sur ce que chaque plan OUVRE,
et les fiches par compte des deux référentiels.

---

## 1. Ce que Sage dit, et ce qu'on en retient

Le module Paie de Sage produit un **fichier plat à réimporter à la main** dans
la comptabilité. Le skill le dit lui-même : « chez Compta Flow, ce pont devrait
être une vraie intégration interne au moteur d'écritures existant, pas un
export de fichier à réimporter ». C'est ce qui est fait · la passation rend des
lignes d'écriture, pas un fichier.

Second emprunt retenu : « chaque taxe et cotisation sociale doit être un barème
CONFIGURABLE, jamais en dur, car chaque État membre a son propre code du
travail ». P2b l'avait déjà appliqué en datant chaque taux ; P3 ne recopie aucun
taux.

---

## 2. L'audit de cohérence · treize rôles confrontés aux deux semis

C'est le cœur du chantier, et il a été fait AVANT d'écrire une ligne. La règle
sortie de la passe F2b s'applique : **ce qu'on affirme du plan se vérifie contre
le plan**. Deux specs, en deux passes, avaient déjà gardé une phrase fausse sur
le semis.

| Rôle | SYSCOHADA | SYCEBNL | Diverge |
|---|---|---|---|
| Appointements, salaires et commissions | 66110000 | 66110000 | non |
| Primes et gratifications | 66120000 | 66120000 | non |
| Congés payés | 66130000 | 66130000 | non |
| Indemnités de maladie | 66150000 | 66150000 | non |
| Avantages en nature | 66170000 | 66170000 | non |
| Autres rémunérations directes | 66180000 | 66180000 | non |
| Indemnité de logement | 66310000 | 66310000 | non |
| Indemnité de transport | 66340000 | 66340000 | non |
| Autres indemnités | 66380000 | 66380000 | non |
| Charges sociales patronales | 66410000 | 66410000 | non |
| CNSS prestations familiales | 43110000 | 43110000 | non |
| CNSS accidents de travail | 43120000 | 43120000 | non |
| **CNSS pensions (retraite obligatoire)** | **43130000** | **43210000** | **OUI** |
| INPP | 43340000 | 43340000 | non |
| ONEM | 43350000 | 43350000 | non |
| IRPP retenu | 44720000 | 44720000 | non |
| Rémunérations dues | 42200000 | 42200000 | non |

**Dix-sept rôles, UN SEUL diverge**, et c'est celui qui porte la ligne la plus
lourde du bulletin. Un test relit les DEUX semis à chaque exécution et vérifie
que chaque numéro y est réellement ouvert · trente-quatre assertions.

---

## 3. Le piège, et la correction évidente qui en est un autre

Le SYCEBNL n'ouvre **ni 4313 ni 4314** sous son 431 ; sa retraite obligatoire
est au **4321**, sous un 432 « Caisses de retraite » qui est une tête de
division (4321 obligatoire, 4322 complémentaire, 4328 autres).

Le SYSCOHADA, lui, ouvre **43130000 « Caisse de retraite obligatoire »** sous
431, et son **43200000 est « Caisses de retraite COMPLÉMENTAIRE »**, semé en un
compte unique.

**Corriger 4313 en 432 rangerait donc la cotisation OBLIGATOIRE sous une nature
FACULTATIVE dans un plan sur deux**, sur une écriture parfaitement équilibrée.
Un test interdit nommément le 43200000 et le 43220000 dans toute la table.

Et trois comptes seraient **inexistants** si l'on se trompe de plan : 43130000
et 43200000 ne sont pas ouverts au SYCEBNL, 43210000 ne l'est pas au SYSCOHADA.
La proposition serait refusée à la saisie APRÈS que le comptable a tout
chiffré · le défaut du 734, du 735 et du 7074.

---

## 4. Cinq absences asymétriques relevées en classe 66, et non codées

La classe 66 coïncide très largement, ce qui n'était pas l'attente. Relevé pour
mémoire, aucune n'est mobilisée par la paie du mois :

- **66330000 « Indemnités d'expatriation »** · SYSCOHADA seulement ;
- **666 « Rémunérations et charges sociales de l'exploitant individuel »**
  (66610000, 66620000) · SYSCOHADA seulement · une EBNL n'a pas d'exploitant ;
- **66720000 « Personnel détaché ou prêté »** · SYSCOHADA seulement ;
- **66820000 « Versements aux comités d'hygiène et de sécurité »** · SYSCOHADA
  seulement ;
- **66500000 « Habillement et équipement du personnel »** et **66900000
  « Dégrèvements et annulations des charges sociales »** · SYCEBNL seulement.

Ce sont des ABSENCES, pas des sens différents · moins traître que « un numéro,
deux sens », aussi coûteux à la saisie.

---

## 5. Le séminaire CPCC se trompe ici, dans les DEUX plans

Il écrit « C/ 4331 INPP · C/ 4332 ONEM ». Le **4331 est « Mutuelle »** et le
**4332 « Assurances retraite »** des deux côtés ; l'INPP est au **4334** et
l'ONEM au **4335**. Un cabinet qui suivrait ce schéma porterait l'INPP à la
mutuelle sur une balance qui boucle. Un test l'interdit.

---

## 6. Quatre natures que la passation n'impute PAS, et pourquoi

Deviner l'imputation produirait une écriture équilibrée sur une nature fausse,
que la Note annexe publierait ensuite.

1. **Participation aux bénéfices** · le SYSCOHADA ouvre 42610000, **le SYCEBNL
   n'ouvre pas de 426 du tout**. L'absence est elle-même la réponse : une
   entité à but non lucratif n'a pas de bénéfices à partager.
2. **Allocations familiales légales** · elles sont SERVIES PAR LA CNSS, et
   l'arrêté n° 143/2018 organise leur paiement par l'employeur en dévolution.
   Ce que l'employeur avance est une CRÉANCE sur la Caisse, non une charge.
3. **Soins de santé** · le plan ouvre 66840000, 66850000 et 42410000, et
   aucune source lue ne dit lequel reçoit un remboursement de frais médicaux.
4. **Frais de voyage et avantages de fonction** · un frais professionnel est un
   transport (classe 61), un avantage de fonction une charge de personnel
   (663), un remboursement effectif ni l'un ni l'autre (art. 68, 1).

Un test vérifie que les deux tables (imputées, non imputées) se complètent
**exactement**, sans trou ni recouvrement, sur les quinze natures.

---

## 7. Le piège symétrique de P2a, et il fallait le nommer

**Sortir de l'ASSIETTE n'est pas sortir de la COMPTABILITÉ.** Le logement et le
transport sortent de la rémunération de l'article 7, point 8, donc de l'assiette
des cotisations · ils sont pourtant **payés**, donc ils sont en CHARGE, au
66310000 et au 66340000. Un test les impute et vérifie qu'ils figurent bien
dans `HORS_REMUNERATION_ARTICLE_7`.

C'est la même erreur que le net à payer de P2b, prise par l'autre bout.

---

## 8. Quatre refus, chacun contre un défaut qui laisse la balance bouclée

1. **NATURE_SANS_IMPUTATION** · l'imputation serait devinée.
2. **COTISATION_EN_ABSTENTION** · l'INPP sans nature d'employeur déclarée.
   L'écriture SERAIT équilibrée, avec une charge de personnel **minorée du
   montant manquant**, et rien en aval ne le verrait. C'est le § 10 bis dans sa
   forme la plus discrète.
3. **IMPOT_INDETERMINE** · pas d'impôt, pas de net.
4. **ECRITURE_DESEQUILIBREE** · le solde du 422 (brut moins retenues) doit
   égaler le net du bulletin, et l'écriture doit s'équilibrer. Les deux
   contrôles sont faits, et leur échec est un **refus** · aucune ligne de
   bouclage n'est posée. Un écart est un défaut du moteur, jamais un arrondi à
   rattraper.

> **CORRIGÉ LE 2026-09-24.** L'écriture est proposée en TROIS TEMPS, dans
> l'ordre du Guide d'application SYSCOHADA (Partie 1 ch. 3 section 4,
> Application 10) : **brut** (D/66, C/422 pour le brut entier, § 4.1),
> **retenues** (D/422, C/43 part ouvrière, C/447 impôt, § 4.3), **charges
> patronales** (D/6641, C/43, § 4.2). La version d'origine créditait le 422 du
> seul net dans une écriture combinée. L'impôt retenu n'est jamais une charge
> de l'employeur.

---

## 9. Ce qui est déclaré plutôt que codé

- **Le journal** · le dossier est semé avec cinq journaux. La paie va aux
  OPÉRATIONS DIVERSES tant que le cabinet n'a pas ouvert un journal de paie
  dédié, ce qu'OmegaX ne fait pas à sa place.
- **Le règlement** · seconde écriture, 422 débité par le crédit de la
  trésorerie, autre journal. Les deux textes l'écrivent à la fiche de leur
  compte 42, et le dépôt l'a payé au chantier des modèles de saisie.
- **Les avantages en nature** vont directement au 66170000. Le livre de cours
  décrit un transfert par le 78. **CORRIGÉ LE 2026-09-24** · ce n'était pas
  « aucune source » : le Guide d'application SYSCOHADA, Partie 1 ch. 3 § 4.5,
  écrit l'enregistrement par nature puis « régularisation globale fin
  d'exercice : débit 6617/6627, crédit 781 ». OmegaX simplifie, et la réserve
  le dit désormais.
- **Le 6641 vise le personnel NATIONAL.** Un dossier qui emploie des
  non-nationaux ventile entre 66410000 et 66420000, et OmegaX ne connaît pas la
  nationalité ligne à ligne. Réserve portée sur la ligne.

---

## 10. Un test corrigé, et il gelait une approximation

Le spec de P2a exigeait **UN SEUL appel Prisma** dans `simulerPaie`, comme
proxy de « aucune écriture ». Il est tombé quand P3 a ajouté la lecture du
référentiel, qui est parfaitement légitime. Il gèle désormais la **propriété**
· aucune opération d'écriture, quelles que soient les lectures. Même famille
que « un test de source s'ancre sur une structure, jamais sur une distance ».

**Huit contresens réinjectés dans la passation, huit attrapés.** 3950 tests
serveur, 503 client.
