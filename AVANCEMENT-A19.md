# Avancement · ligne A19

Inventaire · éditions (fiches de comptage vierges, PV d'inventaire, PV de
caisse) et lieu du bien recopié sur sa fiche (AUDCIF art. 16) · relevé CPCC
C16. Branche de sauvegarde `travail/a19`, partie de `main` c7a73b4.

## Textes lus

- AUDCIF art. 16, al. 6 · « L'entité procède à l'opération d'inventaire par le
  relevé physique de tous les éléments de son patrimoine avec la mention de la
  nature, de la quantité et de la valeur de chacun d'eux à la date de
  l'inventaire. » Al. 7 · « Les données d'inventaire sont organisées et
  conservées de manière à justifier le contenu de chacun des éléments
  recensés du patrimoine. »
- SYCEBNL art. 3 · exclusion « 5, 8, 10 à 13, 17 alinéas 7 et 8, 18, 19
  quatrième tiret, 21, 25 à 34, 49, 69, 70, 71, 73 à 113 » · l'art. 16 vaut aux
  deux référentiels.
- Séminaire CPCC (compétence audcif-acte-uniforme, fichier pratique, témoin) ·
  « inscription sur des fiches appropriées préparées d'avance » (§ IV) ;
  « préparer les fiches par catégorie de biens » (étape 1) ; « Si les fiches
  n'existent pas, les préparer avant que l'inventaire ne débute » et « PV
  d'inventaire physique, signé par ceux qui ont inventorié et assisté »
  (étape 2) ; « par référence à la pièce justificative d'acquisition »
  (étape 3) ; « Les procès-verbaux de comptage ont-ils été analysés ? » (§ VI).

## Fait

1. Lieu du bien recopié en clair dans `FicheInventaire.emplacement` à
   l'engendrement des fiches du parc (`lieu-sur-fiche.ts`), fiches anciennes
   sans emplacement complétées, emplacement saisi jamais écrasé. Aucun
   changement de schéma.
2. Constructeurs des trois éditions (`editions-inventaire.ts`) et trois routes
   de lecture · `GET /inventaire/:id/editions/fiches-de-comptage`,
   `GET /inventaire/:id/editions/proces-verbal`,
   `GET /inventaire/pv-caisse/:pvId/edition`. Spec
   `editions-inventaire.spec.ts`.

3. Écran · boutons « Fiches de comptage », « Procès-verbal d'inventaire »
   (en-tête de la campagne), « Ses fiches de comptage » (chaque
   sous-commission), « Imprimer le procès-verbal » (chaque PV de caisse) ·
   lectures ouvertes à tous. L'édition lue est seule imprimée (`avec-edition`
   tant qu'elle existe, retirée après la boîte d'impression), sous
   `EnteteImpression` portant l'exercice DE LA CAMPAGNE (prop `exercice`
   ajoutée). Cellules construites par `client/src/lib/editions-inventaire.ts`
   (spec sans React), posées par `components/EditionsInventaire.tsx`.
4. Rejeu sur vraie base (`a19_1`, serveur compilé, port 8097), SYSCOHADA et
   SYCEBNL · exercice 2025 avec caisse, banque et une armoire rangée au lieu
   « B2 · Bureau de la direction » ; campagne 2025, fiche du parc engendrée
   avec le lieu, fiches vierges relues, comptage, rapprochement (écart
   -50 000 figé), arbitrage, PV ; clôture de 2025 ; mouvements de caisse
   2026 (+30 000, -10 000) ; PV de caisse compté le 10/01/2026 (519 000
   comptés, solde 520 000, écart -1 000, reconstitution 500 000 / 499 000) ;
   campagne close ; les trois éditions relues contre ces données, mentions du
   PV de caisse identiques à l'écran. Tout concorde aux deux référentiels.

## Reste

- Intégration sur `main` (fiche retirée, suivi à jour).

## Décisions

- Mise en page, ordre (lieu, compte, désignation), regroupement par
  sous-commission · définitions d'OmegaX, dites dans la bulle d'aide.
- Signatures laissées blanches, signataires nommés par rôle.
- PV de caisse · chiffres et mentions de `presenterPvCaisse`, jamais
  recomposés ; attestation · fait (date, signataire), aucun contenu inventé.

## Vérification

```bash
npx tsc --noEmit && npx jest src/modules/inventaire
cd client && npx tsc --noEmit && npx vitest run src/lib/editions-inventaire.spec.ts
node <scratchpad>/rejeu-a19.mjs SYSCOHADA   # serveur compilé sur une base jetable
```
