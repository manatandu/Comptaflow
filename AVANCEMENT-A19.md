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

## Reste

- Écran (impression par `avec-edition`, `EnteteImpression`), spec client.
- Rejeu sur vraie base à travers une clôture.
- Bloc du § 3.

## Décisions

- Mise en page, ordre (lieu, compte, désignation), regroupement par
  sous-commission · définitions d'OmegaX, dites dans la bulle d'aide.
- Signatures laissées blanches, signataires nommés par rôle.
- PV de caisse · chiffres et mentions de `presenterPvCaisse`, jamais
  recomposés ; attestation · fait (date, signataire), aucun contenu inventé.

## Vérification

```bash
npx tsc --noEmit && npx jest src/modules/inventaire
```
