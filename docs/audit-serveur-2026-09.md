# Audit d'interconnexion · serveur et données · 2026-09-27

Lecture seule du dépôt (branche `main`, commit `f910ecf`). Aucun fichier de code
modifié, aucun test lancé : chaque constat cite le fichier et la ligne LUS, et
les décomptes ont été refaits par script sur la source actuelle.

Ce rapport remplace celui de la veille, perdu. Chacun de ses points a été
revérifié dans le code actuel ; tous tiennent encore, et plusieurs ont un
périmètre plus large qu'annoncé. Les constats nouveaux sont marqués
**(nouveau)**.

Gravité :

- **B** · bloquant, ou donnée fausse que rien en aval ne signale ;
- **F** · défaut fonctionnel ou de cohérence, visible dans un cas précis ;
- **I** · défaut d'intégrité ou de structure, qui prépare le prochain B ;
- **C** · propreté, dette, documentation périmée.

Décompte : **3 B, 12 F, 7 I, 11 C.**

---

## B · bloquant

### B1 · L'annulation d'une liquidation de TVA est impossible (interblocage)

- `src/modules/tva/taux-tva.service.ts:2601-2611` · `annulerLiquidation` appelle
  `EcritureService.supprimer(tenantId, liquidation.ecritureId)` en comptant sur
  le `ON DELETE CASCADE` pour emporter le marqueur (`schema.prisma:3237`,
  migration `20260908090000_liquidation_tva:48-50`).
- `src/modules/comptabilite/ecriture.service.ts:835` · `supprimer` passe d'abord
  par `verifierAucunModuleNeLaTient`, dont la ligne 864 compte
  `liquidationTva.count({ where: { tenantId, ecritureId } })`. Le marqueur est
  encore là : le compte vaut 1 et la suppression est refusée (« contrepartie
  comptable d'une liquidation de TVA · défaites l'opération dans son module »).
  Le module qui défait l'opération est précisément celui qui appelle.
- Conséquence : le verrou anti-double-liquidation n'a plus de marche arrière,
  exactement l'impasse que le commentaire de la méthode dit éviter. Le spec
  `liquidation-verrou.spec.ts:209-220` ne le voit pas, `ecritureService` y est
  une doublure.

**Correction.** Dans une seule transaction : relire l'écriture (brouillard,
exercice ouvert, période non verrouillée · les contrôles de
`trouverEnBrouillard` et `verifierEcritureAutorisee`), supprimer le marqueur,
puis les lignes, puis la tête. Le plus propre est d'ouvrir dans
`EcritureService` une méthode `supprimerPourLeModule(tenantId, ecritureId,
detenteurLibere)` qui ignore le SEUL détenteur nommé par l'appelant et garde
tous les autres contrôles.

**Test.** `liquidation-verrou.spec.ts` · monter un vrai `EcritureService` sur
un Prisma factice où `liquidationTva.count` rend 1 tant que le marqueur existe,
appeler `annulerLiquidation` et exiger `{ supprime: true }` et la disparition
du marqueur.

### B2 · Le canevas de trésorerie du groupe vise des comptes absents du plan SYCEBNL semé **(nouveau)**

- `src/modules/groupe/canevas-tresorerie.ts:33-46` impute les rubriques sur
  `60100000`, `61800000`, `62200000`, `62400000`, `62800000`, `63100000`,
  `64100000`, `66100000`.
- Aucun de ces huit numéros n'existe dans `src/modules/comptes/compte-seed.ts` :
  601, 618, 622, 624, 628, 631, 641 et 661 y sont semés en comptes TOTAL non
  complétés (`compte-seed.ts:1440, 1445, 1446, 1448, 1452, 1453, 1459, 1465`),
  leurs feuilles sont `60110000`, `61810000`, `62210000`… (§ 7 de CLAUDE.md).
- `src/modules/groupe/groupe.service.ts:1487-1495` · toute ligne du canevas
  portant l'une de ces rubriques fait refuser l'import entier avec « Comptes
  absents du plan de la cellule … le dossier n'a pas le plan SYCEBNL semé »,
  message faux : le plan est semé, c'est le canevas qui vise des racines.
- Seules les rubriques de recettes, `63300000`, `65200000`, `65800000`,
  `24410000` et les deux trésoreries existent. Un canevas de dépenses courant
  (achats, transport, loyer) ne s'importe jamais. `groupe.spec.ts:318` ne le voit
  pas, ses comptes sont factices.

**Correction.** Choisir, compétence `sycebnl` LUE, le compte d'imputation de
chacune des huit rubriques (une feuille existante de chaque racine), et
corriger le message pour nommer les comptes réellement absents plutôt qu'un
plan non semé.

**Test.** Nouveau spec à côté de `compte-seed-syscohada.spec.ts` · chaque
compte de `RUBRIQUES_CANEVAS` et de `TRESORERIES_CANEVAS` existe dans le semis
SYCEBNL ET y est de type DETAIL.

### B3 · Le report à-nouveau définitif se modifie et se supprime depuis le journal **(nouveau)**

- `src/modules/exercice/exercice.service.ts:853-864` crée le report à-nouveau
  dans l'exercice suivant sans statut, donc au BROUILLARD
  (`schema.prisma:1388`, `@default(BROUILLARD)`), marqué
  `estGenereeParCloture: true`.
- `src/modules/comptabilite/ecriture.service.ts:709-740` · `trouverEnBrouillard`,
  seule garde de `modifier` (l. 744) et de `supprimer` (l. 833), ne regarde ni
  `estGenereeParCloture` ni `estANouveauProvisoire`. L'exercice suivant est
  ouvert : `DELETE /ecritures/:id` retire tout le bilan d'ouverture, `PATCH` en
  change les montants.
- L'écriture est équilibrée, la balance boucle, et l'exercice clos ne se
  rouvre pas pour relancer le report (`exercice.service.ts:697-699`). C'est le
  défaut que § 10 bis décrit pour l'affectation : le bilan d'ouverture cesse de
  correspondre au bilan de clôture (SYCEBNL art. 16, 4) · AUDCIF art. 34), et
  rien ne le voit. La correction (l. 1611) et la réimputation
  (`reimputation.ts`, `estGenereeParCloture`) la refusent déjà : seuls
  `modifier` et `supprimer` restent ouverts.

**Correction.** Refuser dans `trouverEnBrouillard` toute écriture
`estGenereeParCloture` dont l'exercice n'est pas le premier du dossier (le
bilan d'ouverture importé reste corrigeable), avec un message qui renvoie au
report à-nouveau provisoire ou à la correction.

**Test.** `casse-en-silence.spec.ts`, bloc 3 · une écriture
`estGenereeParCloture: true` d'un exercice qui n'est pas le premier : `modifier`
et `supprimer` rejettent, en nommant le report à-nouveau.

---

## F · fonctionnel

### F1 · Deux compensations suppriment la tête d'une écriture sans ses lignes

`lignes_ecriture.ecritureId` est en `ON DELETE RESTRICT`
(`20260827175223_init/migration.sql:136`). Supprimer la tête seule lève P2003.

- `src/modules/tva/taux-tva.service.ts:2550` ·
  `this.prisma.ecriture.delete(...).catch(() => undefined)` : l'erreur est
  AVALÉE. Si le marqueur n'a pas pu s'écrire, l'écriture de liquidation reste
  au journal sans marqueur, et la période redevient liquidable · la seconde
  liquidation double la TVA due.
- `src/modules/facturation/comptabilisation-facture.service.ts:102` · même
  suppression sur le double clic : P2003 rend un 500 brut au lieu du refus
  prévu, et l'écriture du second clic reste au journal, orpheline.
- Les trois autres compensations le font bien
  (`affectation.service.ts:301-302`, `immobilisation.service.ts:598-600`,
  `exercice.service.ts:1071-1072`).

**Correction.** Une seule fonction de compensation, dans `EcritureService`,
qui supprime lignes puis tête dans une transaction et LAISSE REMONTER
l'erreur. Les cinq sites l'appellent.

**Test.** Spec par site · Prisma factice dont `ecriture.delete` rejette tant que
`ligneEcriture.deleteMany` n'a pas été appelé pour cet id ; exiger l'ordre des
appels et qu'aucune erreur ne soit avalée.

### F2 · Une écriture qu'un module tient se modifie et se réimpute

Seule la suppression est gardée par `verifierAucunModuleNeLaTient`.

- `ecriture.service.ts:744-804` · `modifier` remplace lignes, date et libellé
  d'une écriture de liquidation, de facture, d'affectation, de paie… Le
  marqueur affirme un montant (`LiquidationTva.net`, la facture, le bulletin)
  que l'écriture ne porte plus.
- `ecriture.service.ts:1234-1281` · `reimputer` ne reconnaît que trois
  détenteurs (acquisition, sortie, dotation d'immobilisation). Sur une ligne au
  brouillard il fait `ligneEcriture.update` (l. 1307) sans contrôle ; sur une
  validée il passe une écriture de réimputation.
- `ecriture.service.ts:1570-1620` · la correction par inscription en négatif
  ne refuse que l'immobilisation : corriger l'écriture d'une liquidation de
  TVA ou d'une affectation annule son effet au journal et laisse le marqueur
  dire que la période est liquidée, ou le résultat affecté.

**Correction.** Extraire la liste des détenteurs en une fonction
`detenteursDe(tenantId, ecritureId)` appelée par `supprimer`, `modifier`,
`reimputer` (brouillard ET validées) et `corrigerParInscriptionEnNegatif`, avec
un message qui renvoie au module.

**Test.** `casse-en-silence.spec.ts` · pour chaque détenteur de la liste,
`modifier` et `reimputer` rejettent comme `supprimer`.

### F3 · Trois chemins d'écriture recopient en partie les contrôles de `creer`

Référence : `ecriture.service.ts:433-617` (exercice ouvert, date dans
l'exercice, journal actif, équilibre et deux lignes, taux de TVA du dossier,
comptes du dossier et DETAIL, verrou de période, ventilation, sections).

- **Reprise de balance** · `import.service.ts:546` prend `dto.dateOperation`
  sans le borner à l'exercice (aucun autre contrôle, `import.dto.ts:46`) : la
  « faute de janvier » que § 10 bis a fermée dans `creer` reste ouverte ici.
  Ni journal actif, ni `verifierEcritureAutorisee`.
- **Import d'écritures** · `import.service.ts:610-752` · ni journal actif, ni
  verrou de période ou de journal, ni compte en sommeil.
- **Canevas du groupe** · `groupe.service.ts:1508-1540` · ni journal actif, ni
  verrou de période, ni contrôle DETAIL des comptes rubriques.
- **(nouveau)** `reimputer` ne vérifie le verrou de période
  (`verifierEcritureAutorisee`, l. 1289-1291) que pour les lignes VALIDÉES ·
  une ligne au brouillard d'une période close se réimpute, alors que
  `modifier` la refuserait.

**Correction.** Extraire de `creer` une fonction pure
`controlesDEntree(tx, tenantId, piece)` (sans numérotation ni création) et
l'appeler des quatre chemins ; le contrôle de date d'une reprise de balance
en premier.

**Test.** `casse-en-silence.spec.ts` · une reprise de balance datée hors de
l'exercice est refusée ; lecture de source : chaque fichier qui contient
`ecriture.create(` hors `ecriture.service.ts` appelle `controlesDEntree`.

### F4 · `modifier` efface la devise et la ventilation, et ne contrôle pas le taux de TVA **(nouveau)**

- `ModifierEcritureDto.lignes` est un `LigneEcritureDto[]`
  (`dto/brouillard.dto.ts:36-40`), qui porte `ventilations`, `deviseId`,
  `montantDevise`, `coursApplique` (`creer-ecriture.dto.ts:97-112`).
- `ecriture.service.ts:779-793` recrée les lignes SANS ces quatre champs.
  Toute modification d'une écriture en devise perd son montant en devise et son
  cours (la réévaluation ne la voit plus), et toute ventilation analytique
  disparaît (la cascade l'emporte, l. 773-776), sans message.
- Le contrôle de `tauxTvaId` du dossier (`creer`, l. 478-489) et
  `verifierSectionsVentilees` ne sont pas refaits : `modifier` rattache une
  ligne au taux d'un autre dossier, le défaut que `creer` dit fermer.

**Correction.** Recréer les lignes par la même fonction que `creer` (champs et
ventilations compris), et y appeler les mêmes contrôles (voir F3).

**Test.** `brouillard.spec.ts` · modifier une écriture dont une ligne porte
`deviseId`, `montantDevise` et une ventilation : `createMany` reçoit les trois,
et un `tauxTvaId` d'un autre dossier est refusé.

### F5 · Un mouvement de magasin se lie à l'écriture de n'importe quel dossier

- `src/modules/stocks/magasin.service.ts:299` · `ecritureId: dto.ecritureId ?? null`,
  reçu du client (`dto/magasin.dto.ts:77-80`, seulement `@IsUUID`), jamais
  vérifié contre le dossier. La garde de cloisonnement ne regarde pas les clés
  étrangères d'une création (voir I7).
- Conséquences · la clé étrangère sert d'oracle d'existence d'un identifiant
  étranger ; le détenteur est invisible au dossier voisin
  (`verifierAucunModuleNeLaTient` compte avec SON `tenantId`, `ecriture.service.ts:879`), qui
  supprime son écriture et dénoue le lien du premier en silence.
- Les trois autres DTO porteurs d'un `ecritureId` le vérifient
  (`donation.service.ts:127-130, 191-194`, `facturation.service.ts:237-240,
  377-380`, `engagement.service.ts:201-203`).

**Correction.** `findFirst({ where: { id: dto.ecritureId, tenantId } })` avant
la création, refus nommé sinon.

**Test.** `magasin.spec` · un `ecritureId` absent du dossier est refusé et
`mouvementStock.create` n'est pas appelé.

### F6 · Des actes qui engagent lisent la balance brouillard compris

`EcritureService.balance` inclut le brouillard par défaut
(`ecriture.service.ts:2634`).

- **Fiscalité** · `fiscalite.service.ts:369` · résultat fiscal, impôt, minimum
  d'imposition calculés sur des écritures provisoires.
- **Chiffre d'affaires nul sur exercice clos** · l'écriture de clôture (au
  brouillard, voir F12) solde les classes 6 et 7 dans l'exercice clos ; lue
  brouillard compris, la classe 70 y vaut zéro. `chiffreAffaires` (l. 399-401)
  est donc nul pour tout exercice clos, et `chiffresAffairesAnterieurs`
  (l. 1066-1076), qui ne lit QUE des exercices antérieurs, rend une suite de
  zéros : le régime de l'art. 113 d'une personne physique est déduit d'un
  historique fictif.
- **Circularisation** · `circularisation.service.ts:159, 197` · le solde envoyé
  au tiers pour confirmation inclut le provisoire.
- **Inventaire** · `inventaire.service.ts:451` · l'écart d'inventaire (et le
  mali qu'il fait constater) est mesuré contre une balance provisoire.

**Correction.** Passer `false` sur ces quatre chemins ; pour le chiffre
d'affaires, lire le livre-journal SANS l'écriture de clôture
(`estGenereeParCloture: false`), comme le fait déjà `balanceCumulee`.

**Test.** `fiscalite` · un exercice clos dont la balance livre-journal porte
1 000 au 70 rend `chiffreAffaires = 1000`, et une écriture au brouillard ne
change pas l'impôt.

### F7 · Liasse du groupe · le brouillard des cellules devient une écriture VALIDÉE

- `groupe.service.ts:562` · l'agrégat lit `balance(d.id, d.exerciceId)`,
  brouillard compris ; aucun blocage ne le signale (l. 1590-1668).
- `groupe.service.ts:1744-1790` · l'agrégat est écrit en UNE écriture
  `statut: VALIDEE` dans le dossier de combinaison, puis la liasse est produite
  sur elle. Du provisoire entre ainsi, validé, dans un état financier.

**Correction.** Lire `balance(..., false)` pour la liasse, ou bloquer tant
qu'une cellule a du brouillard (la requête existe déjà, l. 1206-1210).

**Test.** `groupe.spec.ts` · une cellule avec une écriture au brouillard : la
liasse refuse, ou l'écriture de combinaison n'en porte pas le montant.

### F8 · Seuils de désignation de l'auditeur · « total du bilan » cumulé ligne à ligne

- `controles.service.ts:640-672` · la boucle porte sur les LIGNES d'écriture
  et ajoute `solde` dès qu'il est positif (l. 656). C'est la somme des débits
  des classes 1 à 5, pas l'actif : une caisse qui reçoit et paie cent fois
  compte cent débits. Le critère « franchi » est déclenché à tort, et un
  signalement faux est le cinquième défaut de § 10 bis.
- La même requête (l. 640-643) rapatrie TOUTES les lignes validées de
  l'exercice, sans borne (§ 8 bis).

**Correction.** Lire `balance(tenantId, exerciceId, false)` (agrégée par la
base), puis additionner les soldes débiteurs PAR COMPTE ; même lecture pour
les produits.

**Test.** `mandat-auditeur.spec.ts` · un compte 57 débité de 100 et crédité de
90 dix fois : total du bilan approché = 100, pas 1 000.

### F9 · Archive de restitution · la ligne du dossier manque, et le manifeste dit le contraire

- `exports/restitution/tables-restitution.ts:146-155` · `Tenant` est exclu de
  `TABLES_RESTITUEES`, « servi par le manifeste ».
- `restitution.service.ts:152-155` ne lit que `id`, `nom`, `referentiel`, et
  `manifeste-restitution.ts:27-28` n'imprime que ces trois champs. Paramètres
  du dossier, identifiants légaux, forme juridique, options (double regard,
  système comptable) ne sortent nulle part.
- `manifeste-restitution.ts:39-49` affirme « un fichier CSV par table » et
  « les colonnes sont celles du schéma, moins cinq · aucune autre colonne n'est
  retirée ». La l. 90 compte d'ailleurs `TABLES_RESTITUEES.length + 1` modèles,
  Tenant inclus.

**Correction.** Écrire `tables/tenant.csv` (une ligne, colonnes de
`colonnesRestituees`, avec la même liste d'exclusion), ou écrire la réserve
dans le manifeste. La première est la seule qui tienne la promesse.

**Test.** `restitution.spec.ts` · l'archive contient `tables/tenant.csv`, et
toute colonne scalaire de `Tenant` absente du CSV figure dans la liste
d'exclusion.

### F10 · Marqueurs posés APRÈS `creer`, hors transaction · écritures doublées ou orphelines **(nouveau)**

`creer` commet sa propre transaction ; le marqueur est écrit ensuite, sans
compensation et sans condition.

- Reprise de régularisation · `regularisation.service.ts:554` teste
  `ecritureRepriseId`, puis `creer`, puis `update` (l. 602-605). Deux appels
  simultanés passent tous deux le test : deux reprises au journal, le second
  `update` écrase le lien, la première reste orpheline et supprimable.
- Extourne de réévaluation · `devises.service.ts:627` puis `:650-653`, même
  schéma.
- Réévaluation · `devises.service.ts:542` et `:583`, puis `reevaluation.create`
  (l. 594) : un échec laisse deux écritures sans détenteur.
- Échéances d'abonnement · `regularisation.service.ts:786-802` · la colonne est
  `@unique` (`schema.prisma:2902`) : la génération concurrente fait tomber le
  second `update` en P2002 après que son écriture est commise.

**Correction.** Donner à `creer` un paramètre `tx` optionnel pour que
l'appelant crée l'écriture et pose le marqueur dans la même transaction ; à
défaut, `updateMany({ where: { id, marqueur: null } })` et compensation par la
fonction de F1 si `count === 0`.

**Test.** Par service · deux appels concurrents simulés (le second voit le
marqueur nul) : une seule écriture reste, ou la seconde est retirée.

### F11 · Journal d'audit · un maillon survit à la transaction annulée **(nouveau)**

- `common/audit/extension-audit.ts:277-287` · hors `journaliserDansTransaction`,
  le maillon s'écrit par `ajouterMaillon(base, …)`, connexion à part.
- Seul `AuthService.register` (`auth.service.ts:100`) s'en sert. Toutes les
  écritures auditées faites dans une transaction (`creer` par
  `avecRetrySerialisable`, la clôture, les imports) écrivent donc un maillon
  qui survit à l'annulation, et un maillon de plus à chaque reprise après
  conflit de sérialisation. Le commentaire de `contexte-audit.ts:34-40` décrit
  le défaut exact, pour le seul cas de l'inscription.
- La chaîne reste vérifiable, mais elle atteste des créations d'écritures qui
  n'ont jamais existé.

**Correction.** Faire poser `journaliserDansTransaction` par
`avecRetrySerialisable` (et par tout `$transaction` qui touche un modèle
audité), pour que le maillon naisse et meure avec l'acte.

**Test.** `journal-audit.spec.ts` · une transaction qui crée une `Ecriture`
puis lève : aucun maillon écrit ; une reprise après P2034 : un seul maillon.

### F12 · L'écriture de clôture reste au brouillard, et un contrôle en fabrique une anomalie **(nouveau)**

- `exercice.service.ts:789-800` crée l'écriture de clôture des charges et
  produits sans statut, donc au BROUILLARD, puis passe l'exercice en CLOTURE
  (l. 868). `valider` refuse ensuite tout exercice clôturé
  (`ecriture.service.ts:984`) : elle ne sera JAMAIS validée.
- Le livre-journal validé de l'exercice clos ne porte donc pas l'écriture de
  clôture, et la balance brouillard compris diffère de la balance du livre
  (cause racine de F6).
- `controles.service.ts:817-836` · `BROUILLARD_EN_RETARD` la signale sept jours
  après la clôture (trente en SYSCOHADA), avec l'action « validez-les » ·
  impossible. C'est le contrôle qui fabrique une anomalie (§ 10 bis).

**Correction.** Décider et ÉCRIRE le statut de l'écriture de clôture. Soit la
créer VALIDÉE (et lire les états du clos sans `estGenereeParCloture`, comme
`balanceCumulee`), soit la garder au brouillard par choix, et l'exclure
nommément du contrôle 4 et du comptage de brouillard.

**Test.** `controles` · un exercice clos dont seule l'écriture de clôture est
au brouillard ne produit pas `BROUILLARD_EN_RETARD`.

---

## I · intégrité et structure

### I1 · La liste des détenteurs d'écriture est incomplète, et rien ne force la décision

Relations vers `Ecriture` au schéma : 24 colonnes dans 19 modèles. La liste de
`ecriture.service.ts:851-897` en couvre 17 modèles. Manquent :

- `ReclassementImmobilisation` (`schema.prisma:3749-3750`, RESTRICT,
  `20260915090000_reclassement_immobilisation:97-100`) · l'écriture de
  reclassement passe la garde, puis la base lève P2003 : 500 brut au lieu du
  refus nommé ;
- `Facture` (`schema.prisma:5778-5779`, SET NULL) · la facture redevient « à
  comptabiliser » en silence ;
- `EcartInventaire` (`schema.prisma:4620`) et `Ecriture.corrigeEcritureId`
  (`schema.prisma:1491`) · ni retenus ni déclarés libres.

§ 10 bis veut qu'une relation nouvelle « oblige quelqu'un à décider » ; aucun
test ne le fait.

**Correction.** Ajouter le reclassement ; déclarer les trois autres dans une
liste `ECRITURE_LAISSEE_PARTIR` avec leur motif.

**Test.** Relire `schema.prisma`, extraire toute relation vers `Ecriture`,
exiger que chaque couple modèle/colonne figure dans l'une des deux listes.

### I2 · Trois colonnes de liaison vers une écriture ne sont jamais écrites

- `EcartInventaire.ecritureId` (`schema.prisma:4620`) · aucune écriture de la
  colonne dans `src/modules/inventaire/`.
- `Consignation.ecritureConsignationId` et `ecritureDenouementId`
  (`schema.prisma:6191-6194`) · `emballages.service.ts:96-107` et `:159-166`
  ne les posent pas ; seule la lecture l. 74-75 les nomme.
- Le refus de `verifierAucunModuleNeLaTient` sur la consignation
  (`ecriture.service.ts:899-901`) ne peut donc jamais se déclencher, et le
  message de `denouer` (`emballages.service.ts:148-151`) renvoie à une écriture
  que rien ne relie.

**Correction.** Poser le lien là où l'écriture est passée (ou retirer les
colonnes par migration et le détenteur mort).

**Test.** Lecture de source · toute colonne `ecriture*Id` du schéma a au moins
un site d'écriture dans `src/`.

### I3 · Relations facultatives vers `Ecriture` sans `onDelete` déclaré

Seize colonnes reposent sur le défaut implicite SET NULL : `Regularisation`
(2), `EcheanceAbonnement`, `Reevaluation` (3), `Immobilisation.ecritureSortie`,
`Donation`, `AffectationResultat`, `EcartInventaire`, `Facture`,
`MouvementStock`, `Consignation` (2), `Ecriture.corrigeEcriture`
(`schema.prisma:2840-3099, 3498, 3899, 4273, 4621, 5779, 6101, 6192-6194,
1492`). La paie, l'ordre de virement et le dérogatoire le déclarent
(`Restrict`). Les 302 clés du schéma correspondent aux migrations (contrôle
par script) : le défaut est de LISIBILITÉ, c'est ce silence qui a produit le
§ 10 bis.

**Correction.** Écrire `onDelete: SetNull` ou `Restrict` sur chacune, par
décision (sans migration pour SetNull, qui est l'état actuel).

**Test.** Relire `schema.prisma` · toute relation vers `Ecriture` porte un
`onDelete` explicite.

### I4 · Tables de même nature que les auditées, absentes de `MODELES_AUDITES`

`common/audit/champs-audites.ts:15` audite `Immobilisation`, `Reevaluation`,
`Regularisation`, `OrdreVirement`, `Bailleur`, `LiquidationTva`,
`RetraitementFiscal`. Ne le sont pas : `DotationAmortissement`,
`AmortissementDerogatoire`, `ReclassementImmobilisation`,
`DepreciationImmobilisation` (actes du registre des immobilisations),
`Facture` (facturier, décret n° 011/42 art. 127 cité par
`facturation.service.ts:451`), `Consignation`, `MouvementStock`,
`EngagementDepense`, `ExecutionEngagement`, `ConventionFinancement`,
`DossierFiscalExercice`, `LotVirement`, `CoursDevise`, `ModeleReglement`,
`MandatAuditeur`.

**Correction.** Les classer, un par un, dans la liste ou dans un commentaire
d'exclusion motivée (le manifeste de restitution les liste déjà comme non
audités).

**Test.** Le même que la liste fermée des colonnes · tout modèle du schéma est
soit audité, soit dans une liste `NON_AUDITES_MOTIVES`.

### I5 · « Résultat avant ou après clôture » écrit cinq fois, avec trois définitions du compte 13

- `etats-financiers/etats-financiers.service.ts:190-200` et
  `etats-financiers-smt.service.ts:152-160` · `startsWith('13')` ;
- `etats-financiers-syscohada.service.ts:537-544` · `COMPTES_RESULTAT_SYSCOHADA`
  = 131 à 139 (`correspondance-bilan-syscohada.ts:583`) ;
- `etats-financiers-smt-syscohada.service.ts:246-250` ·
  `COMPTES_RESULTAT_SMT_SYSCOHADA` ;
- `fiscalite.service.ts:395-396` · `/^13[19]/`, dont le commentaire
  (l. 377-393) dit qu'additionner 132 à 138 compterait le résultat autant de
  fois qu'il y a d'étapes. Les états SYSCOHADA les additionnent.

**Correction.** Une fonction `resultatDeLExercice(lignes, referentiel,
systeme)` dans `etats-financiers.communs.ts`, la liste du compte 13 tranchée
après lecture de la compétence `syscohada` (poste CJ), et les cinq appelants.

**Test.** Une même balance (classe 6/7 soldée, 131 et 134 mouvementés) rend le
même résultat par les états et par la fiscalité.

**Fait le 2026-09-27.** La proposition de lire « tout le 13 » était fausse, et
la relecture l'a dit avant le code · AUDCIF Titre VII, COMPTE 13 : le 130 est
ouvert « à la réouverture des comptes de l'exercice suivant » et porte le
résultat de l'exercice PRÉCÉDENT. Titre VIII ch. 19 § 2.4 : les 132 à 138 sont
virés l'un dans l'autre, leur somme avec le 131 et le 139 vaut le résultat.
Règle unique `etats-financiers/resultat-de-l-exercice.ts` · 131 à 139, jamais
le 130. Trois lecteurs changent de chiffre : la fiscalité (rendait zéro sur une
cascade arrêtée en chemin), le Système minimal SYSCOHADA et la consolidation
(comptaient le 130 comme résultat de l'année ; en consolidation il rejoint les
capitaux propres hors résultat, au cours historique). Quatre réinjections, quatre
attrapées.

### I6 · `FORMES_PERSONNES_PHYSIQUES` écrite quatre fois

`retenues/correspondance-retenues.ts:547` (exportée), `exercice/planning-cloture.ts:105`
(copie locale), `fiscalite.service.ts:1089-1090` et `:1296-1298` (deux
comparaisons en ligne), plus le client `ParametresDossierPage.tsx:176-179`.

**Correction.** Importer la constante partout côté serveur ; côté client,
l'exposer par `/dossier/parametres` (`peutPorterCapital`) plutôt que la
recopier.

**Test.** Lecture de source · `ENTREPRISE_INDIVIDUELLE` n'apparaît hors du
schéma que dans `correspondance-retenues.ts` et `regles-affectation.ts`.

### I7 · Deux trous dans la garde de cloisonnement **(nouveau)**

`common/cloisonnement/extension-cloisonnement.ts` :

- règle A (l. 211-219) · la ligne lue n'est vérifiée que si le résultat porte
  `tenantId`. Un `findFirst({ where: { id }, select: { id: true, montant: true } })`
  sur la ligne d'un autre dossier la rend telle quelle (`dossierDeLaLigne`
  rend `undefined`, l. 138-142). Aucun site actuel n'a été trouvé qui en abuse
  (recherche des lectures par `id` seul : trois, sur des modèles hors dossier) ;
- `create`, `createMany`, `createManyAndReturn` ne sont dans aucune des trois
  listes (l. 46-48) : ni le `tenantId` de `data` ni les clés étrangères ne sont
  confrontés au dossier. F5 en est l'effet.

**Correction.** Règle A · ajouter `tenantId` au `select` avant la requête, et
le retirer du résultat ; créations · vérifier que `data.tenantId` (ou chaque
élément de `data`) épingle le dossier de la session.

**Test.** `cloisonnement.spec.ts` · une lecture unitaire avec `select` sans
`tenantId` d'une ligne étrangère rend `null` ; un `create` au `tenantId`
étranger lève `CloisonnementViole`.

---

## C · propreté

### C1 · Fichiers atteints seulement par des specs

`controles/rapprochement-guide-plan.ts`, `controles/schemas-guide-sycebnl.ts`,
`controles/schemas-guide-syscohada.ts`, `notes-annexes/notes-sycebnl.commun.ts`
(graphe d'imports relevé par script). Soit du code de contrôle qui ne sert
aucun écran, soit des tables de référence : à dire en tête de fichier.

**Test.** Lecture de source · tout fichier non-spec de `src/` est importé par
un fichier non-spec, sauf une liste gelée et motivée.

**Fait le 2026-09-27.** `common/fichiers-sans-appelant.spec.ts` relève le graphe
et gèle cinq exceptions motivées (les quatre ci-dessus et la table de décision
`comptabilite/detenteurs-ecriture.ts`, née de I1) ; chacune le dit dans son
en-tête, le générateur des schémas compris. Deux réinjections, deux attrapées.

### C2 · Exports inutilisés, dont des réserves jamais imprimées

Morts : `formeCommercante` (`commercial/vente-commerciale.ts:474`),
`DESCENTES_DEPUIS_UN_EN_TETE` (`emballages/nomenclature-emballages.ts:142`),
`FMT_PCT` (`exports/theme-etafi.ts:84`), `TAUX_PRELEVEMENT_EXPATRIES`
(`fiscalite/parametres-fiscaux.ts:107`), `echeanceReportee`
(`retenues/jour-ouvrable.ts:244`). Réserves lues par les seuls specs, jamais
portées sur un document : `RESERVE_NOTAMMENT` et `RESERVE_MODELE_NON_LU`
(`personnel/livre-de-paie.ts:201, 205`, la seconde dit l'arrêté de 2008 « NON
LU » alors que `MENTIONS_MODELE_2008` existe), `RESERVE_SMIG_HORAIRE` et
`LACUNES_DECLAREES` (`personnel/bareme-smig.ts:477, 489`). Côté serveur,
`RESERVE_JEU_INCOMPLET` et `DECLARATION_METHODES_IDENTIQUES`
(`situation-intermediaire.ts:27, 42`) ne sont lus que par les specs ; le client
en a sa propre copie (`EtatsFinanciersSyscohadaPage.tsx:10`).

**Correction.** Retirer les morts ; imprimer ou retirer chaque réserve ; servir
les deux textes de la situation intermédiaire depuis le serveur.

**Fait le 2026-09-27.** Les cinq exports morts sont retirés. Les quatre
réserves de paie ne sont plus des constantes : ce qui en restait de vrai est
en commentaire, et deux affirmations fausses sont tombées avec elles (l'arrêté
de 2008 « non lu », lu depuis P6 ; la suspension des allocations familiales
« hors corpus », lue depuis P5). Les deux textes de la situation intermédiaire
restent au serveur, et c'est dit sur place · ils sont la référence contre
laquelle le spec du client vérifie la copie de l'écran, qui évite un
aller-retour de plus. Aucun test de réinjection · on ne réinjecte pas une
suppression.

### C3 · `src/modules/abonnements/` sans module

Services fournis par `PlateformeModule` (`plateforme.controller.ts:6-7`),
dossier sans `*.module.ts`. Le ranger sous `plateforme/` ou lui donner son
module.

**Fait le 2026-09-27.** Rangé sous `plateforme/abonnements/` · un module propre
aurait été circulaire, `AbonnementsService` injectant `PlateformeService`.
`common/dossiers-de-modules.spec.ts` exige un `*.module.ts` dans chaque dossier
de premier niveau de `src/modules/` ; réinjection faite, attrapée.

### C4 · Specs mal rangées

`comptabilite/correction-inscription-negatif.spec.ts` n'importe que
`etats-financiers/` ; `fiscalite/perimetre-loi-23-053.spec.ts` teste
`retenues/correspondance-retenues`.

### C5 · `ReferentielGuard` sans effet

`documents-obligatoires.controller.ts:49` le pose sans aucun
`@ReferentielsAutorises` (ouvert aux deux référentiels depuis le 2026-09-02,
l. 33-46). Le retirer, ou le garder avec un commentaire qui dit qu'il est inerte.

### C6 · Câblage irrégulier des contrôleurs

Les 68 contrôleurs sont câblés et chaque route d'écriture porte un rôle (hors
calculs sans effet et routes d'authentification). Restent six DTO déclarés
dans des fichiers de contrôleur (`natures-compte.controller.ts`,
`sur-site.controller.ts` ×2, `ordres-virement.controller.ts`,
`documents-tiers.controller.ts`), hors des dossiers `dto/`.

### C7 · Décomptes périmés en commentaire

- CLAUDE.md l. 54 « 30 modules métier » · 57 dossiers sous `src/modules/` ;
  l. 57 « 60 migrations » · 150 dossiers sous `prisma/migrations/`.
- CLAUDE.md l. 6281 « Dix tables » et `ecriture.service.ts:810` « Onze tables » ·
  19 modèles, 24 colonnes.
- `ecriture.service.ts:848` « Trois de ces tables n'ont PAS de tenantId » ·
  quatre (dotation, dépréciation, échéance d'abonnement, exécution
  d'engagement).
- CLAUDE.md l. 6081, `restitution.service.ts:85`, `tables-restitution.ts:17`
  « quinze modèles portés par leur parent » · 17.
- `restitution.service.ts:220` et les titres de `restitution.spec.ts:90, 217`,
  `lecture-bornee.spec.ts:129` « 54 tables » · 120.

**Correction.** Écrire les nombres qui se déduisent comme ce qu'ils sont (« la
liste de … ») plutôt qu'un chiffre.

### C8 · Chiffre d'affaires de l'art. 13 recopié

`etats-financiers-syscohada/correspondance-smt-syscohada.ts:1359`
`COMPTES_CHIFFRE_AFFAIRES_ART13 = ['70']`, dont le commentaire dit qu'il est
celui du poste XB. `PREFIXES_CHIFFRE_AFFAIRES_SYSCOHADA`
(`correspondance-compte-resultat-syscohada.ts:632`) le DÉRIVE du modèle, et son
commentaire (l. 625-631) condamne précisément les copies. Les deux coïncident
tant qu'aucun 708 ou 709 n'est créé au dossier.

**Test.** `COMPTES_CHIFFRE_AFFAIRES_ART13` égale `PREFIXES_CHIFFRE_AFFAIRES_SYSCOHADA`,
ou mieux, l'un est l'autre.

### C9 · Arrondi au centime réécrit une vingtaine de fois

`Math.round(x * 100) / 100` défini localement dans `fiscalite.service.ts:60`,
`ecriture.service.ts:2183, 2306, 2404, 2885`, `balance-fonctionnelle.service.ts:225`,
`simulateur-budgetaire.ts:118`, `moteur-etat-personnalise.ts:112`, six fichiers
de `ifrs/` (`r2`, avec `|| 0` qui efface le zéro négatif ailleurs non traité),
`amortissement-degressif.ts:111`, `immobilisation.service.ts:1319, 1429`,
`consolidation/etats-consolides.ts:78`, alors que
`rapprochement/releve-bancaire.ts:157` exporte déjà `arrondi`. Un module
`common/arrondi.ts`, une seule définition du zéro négatif.

### C10 · Garde de source plus étroite que sa règle

`casse-en-silence.spec.ts:149` compte `ecriture.create(` contre `numeroPiece,`
dans DEUX fichiers nommés. La règle (« toute écriture porte le numéro que son
journal impose ») vaut aussi pour `exercice.service.ts:789, 853, 963` et
`ecriture.service.ts`. Balayer tout `src/` hors specs.

### C11 · Point d'entrée Vercel résiduel

`api/index.ts`, `vercel.json`, et le script `vercel-build` de `package.json:18`
(`prisma generate && prisma migrate deploy`). Le déploiement est Cloud Run
(CLAUDE.md § 5) ; si un projet Vercel restait relié au dépôt, ce script
appliquerait les migrations par une seconde chaîne. À retirer.

---

## Examiné et non signalé (voulu ou documenté)

- **Clés étrangères** · les 302 relations du schéma ont, dans les migrations,
  l'action `ON DELETE` que Prisma en déduit (script de comparaison, contraintes
  supprimées et recréées suivies).
- **Cloisonnement des services** · aucune lecture unitaire par `id` seul sur un
  modèle cloisonné ; lettrage et rapprochement vérifient le dossier des lignes
  avant `updateMany` (`lettrage.service.ts:427-431`,
  `rapprochement.service.ts:209-219`) ; donation, facture et engagement
  vérifient leur `ecritureId`.
- **Sorties de cloisonnement** · 16 `horsCloisonnement` (connexion, console,
  semis) et deux `perimetreDeGroupe`, tous motivés et gelés par
  `cloisonnement.spec.ts:278-300`.
- **Garde de référentiel** · aucun `@ReferentielsAutorises` sans
  `ReferentielGuard` (les correspondances trouvées d'abord étaient des
  commentaires qui disent pourquoi le décorateur manque).
- **Restitution et sur site hors `LicenceGuard`** · voulu et écrit
  (`restitution.controller.ts:22-31`, `sur-site.controller.ts:26-36`).
- **Compensations correctes** · affectation (`affectation.service.ts:298-303`),
  dotation concurrente (`immobilisation.service.ts:579-601`), report provisoire
  (`exercice.service.ts:1060-1074`), passation de la paie.
- **Combinaison du groupe** · purge des écritures validées du dossier technique,
  `createdBy` du siège dans les cellules et double regard vide par
  construction : écrits (`groupe.service.ts:1688-1696, 1752-1770`, CLAUDE.md
  § 10 ter).
- **Correction d'une correction** · `corrigeEcritureId` en SET NULL : supprimer
  la correction au brouillard rend l'écriture d'origine de nouveau corrigeable,
  ce qui est l'effet cherché (reste à l'écrire, I1).
- **Balance cumulée** · exclut le report à-nouveau sauf au premier exercice,
  écrit (`ecriture.service.ts:2765-2800`).
- **Stocks, provisions, simulations, états personnalisés** · lecture brouillard
  compris sur des écrans de travail ou de simulation, où elle est permise
  (§ 8 bis) et, pour les deux derniers, paramétrée.
- **Routes d'écriture sans rôle** · seulement des calculs sans effet
  (`reevaluation/calcul`, `simuler`, `proposition`, `calculer`) et
  l'authentification.
- **Modules** · tous les modules sont importés, tous les contrôleurs
  enregistrés ; `JwtAuthModule` l'est par les modules qui s'en servent.
