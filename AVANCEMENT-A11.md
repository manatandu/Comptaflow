# Avancement · ligne A11 (écriture de l'impôt sur le résultat)

Branche de sauvegarde · `travail/a11`. Relevé CPCC C7, décision de Manasse du
2026-10-02. Fiche retirée à l'intégration.

## Fait

- Table `ConstatImpotResultat` (`constats_impot_resultat`), migration écrite à
  la main `20270122000000_constat_impot_resultat` · un constat non annulé par
  exercice (index unique NULLS NOT DISTINCT sur `exerciceId, annuleeLe`),
  écriture RETENUE (`onDelete: Restrict`, `COLONNES_QUI_RETIENNENT`,
  `detenteursDe` · `DETENTEUR_IMPOT_RESULTAT`).
- Règles pures `src/modules/fiscalite/ecriture-impot-resultat.ts` · comptes,
  conditions à déclarer par forme, motifs de refus, imputation des acomptes,
  lignes.
- Service `src/modules/fiscalite/constat-impot.service.ts` · `etat`,
  `passer` (montant rejoué par `FiscaliteService.resultatFiscal`, brouillard
  par `EcritureService.creer`, journal OD, date de fin d'exercice, 409 et
  retrait de l'écriture sur un second clic), `annuler` (brouillard supprimé,
  validée inscrite en négatif, constat marqué, art. 20 al. 2).
- Routes (contrôleur fiscal, SYSCOHADA par la classe) ·
  `GET/POST fiscalite/exercices/:exerciceId/ecriture-impot`,
  `POST .../ecriture-impot/annuler` (`@ReserveAuComptable`).
- `FiscaliteService.lireBalance` lit le 89 (solde, et 891 + 895 de
  l'exercice) ; `resultatFiscal` les sert et OBSERVE l'impôt non réintégré à sa
  mesure (art. 45 et 50, 2°), dans les deux sens.
- Écran · `client/src/components/EcritureImpotResultat.tsx`, dans la fenêtre
  Résultat fiscal (SYSCOHADA, `referentielsApplicables`), affichée sur
  l'exercice seul (voir 12).
- Tests · `src/modules/fiscalite/ecriture-impot-resultat.spec.ts`.

## Décisions (tranchées par le texte)

1. **Écriture** · D 89110000 / C 44100000. AUDCIF Titre VII, compte 89 ·
   « Débité de l'impôt exigible, par le crédit du compte 441 (État, impôt sur
   les bénéfices) ». Sous-compte 8911 « Activités exercées dans l'État » ·
   l'impôt calculé ne porte que sur les bénéfices réalisés en RDC (loi
   n° 23/053, art. 7, « uniquement »). 891 est un TOTAL au semis.
2. **Acomptes hors de la charge** · fiche du 89, « Le compte 891 doit
   correspondre au montant total de l'impôt dû de l'exercice, quelles que
   soient les modalités de règlement » ; Guide, Partie 1 ch. 3, Application 8
   (891 = 180 malgré 160 d'acomptes). L'imputation est une seconde paire
   D 441 / C 4492, DEMANDÉE par le cabinet (le 4492 peut porter une
   consignation, art. 110 LPF), bornée aux acomptes déclarés, au solde
   débiteur du 4492 et à l'impôt (art. 57 bis al. 3 LPF, « à déduire de
   l'impôt dû » ; l'excédent reste un crédit, art. 57 ter).
3. **Impôt minimum (art. 57) au 895** · la loi n° 23/053 le nomme
   « minimum forfaitaire de perception » et le distingue de l'IS à l'art. 45
   (« à l'exception de l'Impôt sur les Sociétés et du minimum forfaitaire de
   perception ») ; le plan lui ouvre le 895 « Impôt minimum forfaitaire
   (I.M.F.) ». Subdivision spéciale contre commentaire général du 891 · le 895
   quand `minimumApplique` (strict), le 8911 sinon.
4. **Refus nommés** · forme non renseignée ; personne physique
   (`FORMES_PERSONNES_PHYSIQUES`, art. 3) ; régime autre que l'IS ; exercice
   ouvert avant le 1er janvier 2026 (simulation) ; exercice clos ; écritures de
   gestion au brouillard (le calcul ne lit que le livre-journal, art. 22, 2°) ;
   891 ou 895 déjà mouvementé ; 89 non égal à la réintégration
   IMPOT_SUR_LE_RESULTAT (art. 45, 50, 2°) ; impôt null ou nul. Formes à
   assujettissement conditionnel (SNC et SCS art. 4, GIE art. 6, coopérative
   art. 5, 2°, entité publique art. 5, 1°, succursale art. 7 et 8) · attestation
   écrite exigée au clic, gardée sur le constat.
5. **Cloisonnement** · contrôleur `@ReferentielsAutorises(SYSCOHADA)` +
   `ReferentielGuard`, service `tenantSyscohada` ; fenêtre
   `referentielsApplicables: ['SYSCOHADA']`. Le SYCEBNL n'ouvre aucun 89
   (gelé par le spec).

## Corrections du premier tour (2026-10-03)

6. **B1 · le 899 hors de l'impôt constaté** · la réintégration se compare aux
   seuls DÉBITS des 891, 892 et 895 (`impotConstateAu89`) ; le 899 est lu à
   part (`degrevementsAu899`) et NOMMÉ en information
   (`observationDegrevement`). Loi n° 23/053, art. 45 · « si des dégrèvements
   sont ultérieurement accordés sur les impôts DÉDUCTIBLES, leur montant entre
   dans les recettes » · lu a contrario, celui de l'IS n'y entre pas, mais
   aucun texte exprès ; rien n'est déduit d'office, le sort fiscal est au
   cabinet. Test « 899 crédité, le module reste passable » (`fiscalite.spec.ts`).
7. **M1 · le 895** · la loi n° 23/053 nomme l'impôt minimum à part encore à
   l'art. 42, al. 2, 2° (« l'Impôt sur les Sociétés et l'impôt minimum
   forfaitaire ») et à l'art. 150 (« de l'Impôt sur les Sociétés, de l'Impôt
   minimum »). Le 895 pour un BÉNÉFICE dont l'impôt au taux reste sous le
   minimum est une LECTURE D'OMEGAX (art. 57, un seul impôt minimum pour les
   deux cas ; le séminaire CPCC ne vise que la perte fiscale).
8. **M2 · deux pratiques pour les acomptes** · Guide, Partie 1 ch. 3 § 2.3 et
   Application 8 · acomptes au DÉBIT du 441 ; OmegaX lit le 4492 (fiche du
   compte 44). Refus d'imputation · « Acomptes passés au 441 : rien à imputer ».
9. **M3** · le refus de réintégration nomme l'autre issue (ligne libre pour un
   impôt hors du 89 réintégré à raison, ou reclassement de la charge au 89) ;
   **M4** · un seul formateur (`montantFiscal`) pour le motif et l'observation.
10. **M6** · la fiche du 89 subdivise le 891 par lieu de l'activité (8912,
    8913) ; l'IS congolais sur une activité hors RDC attribuée par une
    convention (art. 7) n'est pas tranché ni calculé. **M7** · le refus de la
    personne physique renvoie au 1043 (AUDCIF, Titre VII, compte 104).
11. **M8** · `annuler` passe `tenantSyscohada` (rendue publique), sans relire
    le régime. **M9** · repli sur le premier journal général (ordre fixe par
    code puis identifiant) dit dans la réponse ; la pièce orpheline d'un
    retrait manqué est nommée dans le 409.
12. **Écran (B2, B3 et suivants)** · composant montré sur l'exercice seul (un
    constat reste visible et annulable) ; case d'imputation remise à faux sur
    un refus et envoyée `imputer && motifRefus === null` ; état vidé au
    changement d'exercice, « Lecture… », erreur effacée à chaque relecture,
    compteur de relecture local ; « Écriture introuvable » et annulation
    ouverte ; écart en valeur absolue avec « supérieur » ou « inférieur » ;
    « Passer » fermé sous la longueur d'attestation SERVIE
    (`longueurMinAttestation`) ; libellé « Fondement de l'assujettissement »,
    condition en bulle `Aide` ; montant d'imputation masqué sur refus ; compte
    rendu après passage et après annulation ; boutons à `peutValider` comme
    `@ReserveAuComptable`.

## Ce que le corpus ne tranche pas (à remonter)

- Aucun texte ne NOMME le compte de l'impôt minimum de l'art. 57 ; la lecture
  895 repose sur l'art. 45 et l'intitulé du plan, contre le commentaire du 891
  (« montant total de l'impôt dû »).
- Le sort fiscal d'un dégrèvement d'IS crédité au 899 (art. 45 ne vise que
  les impôts déductibles ; aucun texte exprès).
- Tension relevée (M5, rien changé) · la lecture F12 du dégressif (régime du
  bien mis en service dès le 1er janvier 2026, jamais lu sur l'ouverture de
  l'exercice) contre le refus d'A11 d'un exercice OUVERT avant cette date
  (simulation) ; l'art. 153 de la loi n° 23/053 ne dit rien d'un exercice à
  cheval.

- Inscrit aux listes fermées · `MODELES_CLOISONNES`, `MODELES_AUDITES`,
  libellé du journal d'audit, décompte de `lecture-bornee.spec.ts` (145),
  doublures Prisma des specs qui comptent les détenteurs.
- Tests du câblage · `src/modules/fiscalite/constat-impot.service.spec.ts`.

## Résultat des suites (2026-10-03)

- Serveur, `npx jest --maxWorkers=2` · 701 suites, 9533 tests ; 17 suites
  tombées au premier passage · 5 réelles (doublures sans
  `constatImpotResultat`, listes fermées), corrigées ; 12 par processus tué
  (SIGKILL, mémoire partagée), toutes relancées seules et vertes (26 suites,
  695 tests, puis `personnel-audit-final` 26 tests).
- Client · `npx tsc --noEmit`, `npm test` (203 fichiers, 1657 tests),
  `npm run build` verts. Serveur · `tsc` et `nest build` verts.

Second passage, après les corrections du premier tour · serveur
`npx jest --maxWorkers=2` · 702 suites, 701 vertes, 9718 tests verts, aucun
processus tué ; la suite tombée était le nouveau spec client, qui importait
`vitest` alors que la racine le lit aussi sous Jest · import retiré (globales,
comme les autres specs de `client/`), relancé seul sous Jest et sous Vitest,
5 tests verts. Client · `tsc`, `npm test` (204 fichiers, 1662 tests),
`npm run build` verts ; serveur · `tsc` et `nest build` verts. Aucun
changement de schéma, pas de `migrate diff` à refaire.

## Reste

- Relectures (adverse, échecs silencieux, TypeScript, écran) à l'intégration.
- Contrôle de dérive de la migration par l'intégrateur.

## Vérification

```bash
npx prisma generate
NODE_OPTIONS=--max-old-space-size=3500 npx tsc --noEmit -p .
npx jest src/modules/fiscalite
npx jest
cd client && npx tsc --noEmit && npm test && npm run build
```
