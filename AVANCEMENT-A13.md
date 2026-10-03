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
