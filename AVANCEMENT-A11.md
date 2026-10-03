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
  Résultat fiscal (SYSCOHADA, `referentielsApplicables`), affichée au seul
  régime de l'IS.
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

## Ce que le corpus ne tranche pas (à remonter)

- Aucun texte ne NOMME le compte de l'impôt minimum de l'art. 57 ; la lecture
  895 repose sur l'art. 45 et l'intitulé du plan, contre le commentaire du 891
  (« montant total de l'impôt dû »).

## Reste

- Suites complètes serveur et client (bloc du § 3), commit final.

## Vérification

```bash
npx prisma generate
NODE_OPTIONS=--max-old-space-size=3500 npx tsc --noEmit -p .
npx jest src/modules/fiscalite
npx jest
cd client && npx tsc --noEmit && npm test && npm run build
```
