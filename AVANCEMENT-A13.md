# Avancement · ligne A13

Ligne A13 de `docs/suivi-immobilisations-verrouille.md` · « Contrôles · banque
sans rapprochement clos à la clôture (fiche du compte 52) et période restée
ouverte au-delà de la clôture informatique trimestrielle (AUDCIF art. 22, 3°) ·
relevé CPCC C9 et C10 ». Branche de sauvegarde `travail/a13`.

## Fait

1. Règles pures · `src/modules/controles/banque-et-cloture-informatique.ts`.
2. Câblage dans `ControlesService.analyser` (contrôles 32 et 33), ajouts
   localisés · méthode `controlesBanqueEtClotureInformatique`, relevé des
   journaux écrits et des comptes 52 mouvementés dans le parcours par tranches
   déjà existant (aucune seconde lecture des écritures ; `journalId`, `compte.id`
   et `compte.intitule` ajoutés à `SELECT_ECRITURE_CONTROLEE`).
3. Tests · `src/modules/controles/banque-et-cloture-informatique.spec.ts`
   (règles pures, deux semis relus, câblage sur doublure qui honore le `where`).
   Doublures complétées (`cloture.findMany`) dans six specs de la batterie.

4. Bloc du § 3 passé des deux côtés (2026-10-03) · serveur `tsc` et `nest
   build` propres ; `npx jest --maxWorkers=2` · 700 suites, 663 vertes au
   premier passage, 37 tombées par processus TUÉS (SIGKILL, mémoire de la
   machine partagée) ou délai de 5 s dépassé sous charge, toutes RELANCÉES
   seules (`--runInBand`) · 37 vertes, 554 tests ; premier passage 9 214 tests
   verts sur 9 225 comptés, les 11 rouges sont dans les suites relancées. Client
   `tsc`, `vitest` (203 fichiers, 1 656 tests) et `vite build` propres.

5. Corrections du premier tour de relecture (2026-10-03), voir la section
   « Corrections du premier tour » ci-dessous. Pied de commit · la seule ligne
   `Claude-Session:` (décision de Manasse du 2026-10-03).

## Reste

- Relecture adverse et intégration (hors de cette copie).
- Aucun écran à toucher · les anomalies passent par la fenêtre « Analyse et
  contrôles » existante, qui affiche toute anomalie rendue par le serveur.

## Décisions, avec leur texte

- **BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE, AVERTISSEMENT.** Fiche du compte 52,
  mot pour mot aux deux plans (AUDCIF Titre VII ; SYCEBNL Partie 2 ch. 3) ·
  « Le solde qui ressort des livres comptables doit être rapproché du solde du
  compte tenu par la banque et envoyé périodiquement à l'entité. Les
  différences éventuelles doivent être recherchées et faire l'objet d'écritures
  de redressement lorsqu'elles n'ont pas pour origine un chevauchement de
  dates. » Éléments de contrôle · « relevés bancaires ; états de rapprochement
  bancaire ». Un « doit » · avertissement.
  - Le texte dit « périodiquement » et ne fixe AUCUNE date · OmegaX ne réclame
    pas un relevé daté du jour de clôture, seulement qu'un rapprochement CLOS
    atteigne ce jour (relevé daté au plus tôt de la clôture ; la chaîne des
    rapprochements est continue).
  - Comptes · racine 52 hors 526. Les deux semis portent 52610000 et 52670000
    « intérêts courus, charges à payer / produits à recevoir » · aucun relevé
    n'a de solde à leur opposer. Gelé par le spec sur les deux semis.
  - « Mouvementé dans l'exercice » · au moins une ligne dans une écriture de
    l'exercice, tous statuts, à-nouveau compris (un solde reporté se rapproche
    aussi).
  - Ne parle qu'au LENDEMAIN de la clôture (`echeanceDepassee`) · avant, aucun
    relevé ne peut la couvrir. Vaut aussi pour un exercice clôturé · le
    pointage n'est pas figé par la clôture (`pointer` ne lit pas le gel).
- **CLOTURE_INFORMATIQUE_EN_RETARD, AVERTISSEMENT.** AUDCIF art. 22, 3° · « la
  chronologie des opérations écarte toute insertion intercalaire ou addition
  ultérieure ; une procédure périodique dite « clôture informatique » au moins
  trimestrielle est prévue, mise en œuvre au plus tard à la fin du trimestre
  qui suit la fin de chaque période ». Glossaire (Titre VI, « CLÔTURE
  INFORMATIQUE ») concordant. « est prévue, mise en œuvre au plus tard » ·
  obligation, avertissement.
  - SYCEBNL · l'art. 3 de l'Acte uniforme SYCEBNL rend l'AUDCIF applicable
    « à l'exception des articles 5, 8, 10 à 13, 17 alinéas 7 et 8, 18, 19
    quatrième tiret, 21, 25 à 34, 49, 69, 70, 71, 73 à 113 » · l'art. 22 n'y
    est pas, il vaut aux associations, et le message le dit par ce chemin.
  - Ce qui fige · clôture de PÉRIODE (tous journaux) et TOTALE (un journal
    jusqu'à une date), définitives. La PARTIELLE est réversible (`annulable`),
    elle n'écarte aucune insertion (même lecture que `gel-cloture.ts`).
    Annulées écartées. Exercice clôturé · tout est figé, non examiné.
  - Période · OmegaX ne connaît pas les périodes de l'entité. Il part du
    lendemain du dernier jour figé de chaque journal écrit (ou de l'ouverture),
    prend la période la plus LONGUE que le texte admette (trois mois, bornée à
    la fin de l'exercice) et son échéance au dernier jour des trois mois qui
    suivent. Lecture la plus large · une entité aux périodes plus courtes
    aurait une échéance plus proche, jamais plus lointaine. Retard dit au
    lendemain de l'échéance.
- **Entrée en vigueur (§ 10 bis).** AUDCIF art. 113 · « pour les comptes
  personnels des entités, au 1er janvier 2018 » ; Acte uniforme SYCEBNL
  art. 28 · « applicable à compter du 1er janvier 2024 ». Exercice ouvert avant
  · non examiné (lu sur `dateDebut`).

## Corrections du premier tour (2026-10-03)

- **B1 · compte fermé en cours d'exercice.** Couvert quand TROIS faits sont
  réunis (`compteFermeCouvert`) · dernier rapprochement clos à `soldeReleve`
  nul, relevé daté au plus tôt de la DERNIÈRE ligne du compte dans l'exercice
  (relevée dans le parcours par tranches), solde comptable nul à la clôture
  (tenu en centimes). Un solde comptable nul seul ne couvre pas. Tests · cas et
  trois contre-cas, purs et câblés.
- **(a)** AUDCIF art. 42 cité (code, `sourceFicheCompte52`, message), non exclu
  par l'art. 3 de l'Acte uniforme SYCEBNL (liste « 5, 8, 10 à 13, 17 al. 7 et 8,
  18, 19 quatrième tiret, 21, 25 à 34, 49, 69, 70, 71, 73 à 113 »).
- **(b)** Un état à régler avant l'arrêté · libellé « Compte de banque à
  rapprocher avant l'arrêté des comptes », action « À rapprocher avant l'arrêté
  des comptes », AUDCIF art. 23 (« arrêtés au plus tard dans les quatre mois
  qui suivent la date de clôture »), jamais « retard » (gelé par un test).
- **(c)** `finDeTroisMois` · la veille du même quantième trois mois plus tard,
  la fin du mois quand ce quantième n'existe pas (31/01 → 30/04). Tests.
- **(d)** Le détail dit « posée dans OmegaX » ; l'action dit qu'une clôture
  faite dans un autre logiciel avant la reprise n'est pas connue. DÉCISION · un
  journal créé en cours d'année ne part PAS de sa première écriture · la
  chronologie que l'art. 22, 3° protège est celle de l'organisation comptable,
  et une écriture de mars dans un journal ouvert en septembre est précisément
  une « insertion intercalaire » ; le texte ne le permet donc pas (écrit en
  tête de `banque-et-cloture-informatique.ts`).
- **(e)** L'action nomme l'administrateur (routes de clôture totale et de
  période `@Roles(ADMIN_CABINET)`) et l'effet · définitive, fige aussi le
  lettrage et la ventilation analytique jusqu'à sa date (`gel-cloture.ts`).
- **(f)** Vérifié dans `devises.service.ts` · les disponibilités
  (`RACINES_DISPONIBILITES`, 52 compris) sont réévaluées au cours de clôture.
  L'action le dit pour un compte en devises.
- **(g)** Date du dernier relevé clos par `groupBy` (`_max.dateReleve`), puis
  `soldeReleve` lu pour les seuls comptes nuls aux livres et non couverts, une
  ligne par (compte, date), le plus récemment clos retenu. Test sur le `where`.
- **(h)** Limite écrite · un 52 sans aucune ligne dans l'exercice n'est pas vu.
- **(i)** L'à-nouveau provisoire n'entre pas dans les journaux écrits. Deux
  tests.
- **(j)** Écart du texte sur le 526 écrit en commentaire (fiche du 52 · « 5261
  en monnaie locale · 5265 en devises » ; semis · 5261 et 5267 intérêts
  courus), rien changé.
- **(k)** `rapprochement.dto.ts` · `@IsDateString` et le fuseau · hors ligne,
  NON corrigé (consigne du coordinateur).
- Bloc du § 3 rejoué après corrections (2026-10-03) · serveur `tsc` et `nest
  build` propres ; `npx jest --maxWorkers=2` une fois · 700 suites, 9 718
  tests, un seul rouge (`citations-articles.spec.ts`, le titre d'un test lu
  « SYCEBNL art. 42 ») corrigé puis relancé seul, vert ; aucune suite tuée.
  Client `tsc`, `vitest` (203 fichiers, 1 656 tests) et `vite build` propres.
- Doublures · `rapprochementBancaire.groupBy` ajouté dans sept specs qui
  passent par `analyser` avec un 52, sans quoi elles tomberaient après le
  31 décembre 2026.

## Corrections du second tour (2026-10-03)

- **B-α · conversion prise pour une opération de banque.** Les lignes des
  écritures d'écarts et de contre-passation d'une réévaluation, et de leurs
  inscriptions en négatif (`corrigeEcriture`), comptent au solde et jamais à
  la date de la dernière ligne (`estEcritureDeConversion`, par la LIAISON ·
  `reevaluationEcarts`, `reevaluationExtourne`, `corrigeEcriture` ajoutés à
  `SELECT_ECRITURE_CONTROLEE`, jamais le libellé). `derniereLigne` devient
  `Date | null`. ÉCART À LA CONSIGNE, motivé · la réévaluation ANNULÉE est
  écartée aussi. Son écriture d'origine reste au journal (D6), neutralisée par
  son négatif ; la compter refaisait B-α (écart d'origine au 31/12, négatif au
  31/12, aucun des deux n'est un mouvement du relevé). Tests · compte USD fermé
  en juin, relevé nul en juin, écart au 31/12 · non signalé ; même cas avec
  réévaluation annulée et repassée · non signalé ; jumeau, même ligne passée à
  la main · signalé.
- **B-β · clôture de N+1 ignorée.** Borne haute retirée de la lecture des
  clôtures (`dateLimite: { gte: debut }` seul) ; doublure et assertion
  adaptées. Tests · période de N+1 au 31/03 · rien sur N ; totale de N+1 sur
  un journal · seul l'autre journal signalé.
- **m4** écrit dans l'en-tête (limite des trois faits).

## Relevés en attente (second tour, non corrigés)

- **m1** · le dernier clos est pris par `max(dateReleve)` et non par
  `clotureAt` ; rien n'impose à l'ouverture une date de relevé croissante.
- **m2** · un à-nouveau provisoire périmé, ou sans le brouillard de N-1,
  fausse le solde comptable lu · piste, message « relancez les à-nouveaux
  provisoires ».
- **m3** · le journal d'à-nouveau DÉFINITIF compte comme journal écrit · une
  ligne de bulle Aide à prévoir.
- **m5** · l'avertissement bancaire part dès le lendemain de la clôture,
  voulu (état à régler avant l'arrêté).
- **Vu en passant, hors A13** · `DevisesService.extourner` contre-passe TOUTES
  les lignes de l'écriture d'écarts, celles du 52 et du 676 / 776 comprises,
  alors que la règle d'A5 dit « l'extourne ne touche que 478 et 479 » et que
  l'écart sur disponibilité est RÉALISÉ (art. 57). À vérifier dans la ligne
  A5 ; ici la contre-passation est seulement tenue hors de la dernière ligne.

## Ce que le corpus ne tranche pas (consigné, rien codé)

- La date du relevé « à la clôture » · la fiche dit « périodiquement » ; la
  date exacte de clôture serait une exigence inventée, d'où « au plus tôt ».
- La définition des « périodes » de l'art. 22, 3° (calendaires, mensuelles,
  libres) · d'où la lecture la plus large ci-dessus.
- Une clôture posée EN RETARD dans le passé (période close après son
  échéance) n'est pas signalée · le contrôle dit l'état présent. La reconstituer
  supposerait de dater l'entrée des données dans OmegaX (dossier repris), et
  le signal serait fabriqué pour un dossier saisi après coup.

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/controles
npx jest
npm run build
cd client && npx tsc --noEmit && npm test && npm run build
```
