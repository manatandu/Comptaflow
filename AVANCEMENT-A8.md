# Avancement · ligne A8 (décompte final émis, figé et passé au journal)

Branche de sauvegarde : `travail/a8` (`git push -q origin HEAD:refs/heads/travail/a8`).
Jamais sur `main`, aucune demande de tirage. Fiche retirée à l'intégration.

## Objet

Le décompte final (module `src/modules/personnel/decompte-final.ts`, P4) ne
faisait que calculer. A8 le fait ÉMETTRE et FIGER comme un bulletin
(numérotation continue, indélébile, annulation motivée, remise déclarée),
avec ses retenues (CNSS ouvrière, impôt, autres) et son net, puis le fait
passer au journal par la même mécanique que la paie du mois (P9).

## Sources lues (2026-10-03)

- AUDCIF, Titre VIII ch. 21 § 5.2 · « L'indemnité de cessation d'emploi est
  comptabilisée au débit d'un compte de charge de personnel par le crédit du
  compte 42 Personnel » ; exemples · licenciement, rupture conventionnelle,
  plan de départ volontaire.
- AUDCIF, Titre VII, fiche du compte 66 · 6614 « Indemnités de préavis, de
  licenciement et de recherche d'embauche » ; 66 débité par le crédit du 422.
- SYCEBNL, Partie 2 ch. 3, fiche du compte 66 · mêmes subdivisions (6614,
  même intitulé) et même fonctionnement ; fiche du compte 42 · crédité des
  rémunérations brutes par le débit des 66.
- Semis · `66140000` aux deux (`compte-seed.ts` l. 981 « Indemnités de préavis
  et de licenciement » ; `compte-seed-syscohada.ts` l. 1232 « Indemnités de
  préavis, de licenciement et de recherche d'embauche »). Même numéro, aucun
  rôle divergent ; l'intitulé SEMÉ côté SYCEBNL est plus court que celui de
  sa fiche (ch. 3) · écart du SEMIS (`compte-seed.ts`, ligne du 66140000), le
  plan du ch. 2 du SYCEBNL s'arrêtant au 66 ; semis non retouché, signalé.
- 66240000 aux deux semis (personnel non national), même fiche.
- Code du travail, art. 100, 103, 104 ; arrêté n° 12/CAB.MIN/ETPS/042 du
  8 août 2008, art. 2 (décompte écrit « lors de la résiliation du contrat de
  travail, pour quelque cause que ce soit ») ; art. 7, point 8 (liste
  d'exclusion FERMÉE de la rémunération).
- Loi n° 23/053, art. 68, 6° · imposables « les sommes payées par
  l'employeur [...] par suite de cessation de travail ou de rupture de
  contrat d'emploi » ; art. 118 et 119 (barème, retenue mensuelle).

## Décisions (de Manasse, 2026-10-02, appliquées telles quelles)

- IMPÔT · barème du mois (art. 118 et 119), le mois de cessation annualisé
  comme un bulletin, avec une réserve écrite sur le versement unique.
- COEXISTENCE · le décompte REMPLACE le bulletin du dernier mois ; un
  bulletin actif du même mois refuse le décompte, et inversement.

## Plan

1. [x] Schéma · `BulletinPaie.nature` (`MOIS` | `DECOMPTE_FINAL`), migration
   `20270119000000_decompte_final_emis` (renommée au premier tour) écrite à la main. CONTRÔLE DE DÉRIVE
   NON PASSÉ LOCALEMENT · le PostgreSQL du conteneur n'admet que l'auth par
   pair ou par mot de passe, et l'ouverture d'un accès local a été refusée
   par la politique de l'environnement. La migration est le strict pendant du
   schéma (type énuméré + colonne NOT NULL DEFAULT 'MOIS') ; le portillon
   `verifier` la jouera sur PostgreSQL 18 et 17.
2. [x] Moteur · nature `INDEMNITE_DE_FIN_DE_CONTRAT` (6614 aux deux plans,
   rôle `INDEMNITES_DE_PREAVIS_ET_LICENCIEMENT`), `decompte-final-emis.ts`
   (rubriques vers éléments, refus du solde partiel, arriérés = éléments du
   mois versés, mois de cessation = mois de fin du contrat, type du registre).
3. [x] Service et route · `POST /personnel/salaries/:salarieId/decompte-final`
   (`emettreDecompteFinal`), création partagée avec le bulletin
   (`figerBulletin`, une séquence, un actif par salarié et par mois toutes
   natures confondues) ; passation par la paie du mois (P9) sans autre chemin.
4. [ ] Écran · bouton « Émettre le décompte » dans l'onglet du décompte,
   nature affichée dans la liste des bulletins.
5. [ ] Bloc du § 3 des deux côtés.

## Décisions prises en lisant la loi (session A8)

- Indemnité de préavis, dommages-intérêts de l'art. 70 et somme convenue de
  l'art. 61 bis · nature `INDEMNITE_DE_FIN_DE_CONTRAT`, compte 66140000
  (AUDCIF Titre VIII ch. 21 § 5.2 ; fiche du compte 66 des deux textes).
  IMPOSABLE (loi n° 23/053, art. 68, 6°). Assiette SOCIALE · le corpus se
  tait (ni nommée ni exclue par l'art. 7, point 8 ; la mention 20 du modèle
  de 2008 ne la range pas) · OmegaX la garde dans l'assiette, RÉSERVE écrite
  sur la ligne (`RESERVE_ASSIETTE_SOCIALE_INDEMNITE`). Ses AVANTAGES
  (art. 63 al. 3, art. 70) se ventilent par nature (logement, transport,
  soins sortent de l'assiette ; « autres » restent dans l'indemnité) ; non
  ventilés, refus. Ouverte ni au DTO d'un élément ni aux rubriques du cabinet.
- Indemnité compensatoire de congé au 6613 (nature existante), gratification
  au 6612, allocations familiales du décompte sous leur nature (hors
  rémunération, et leur montant s'ajoute au taux légal de l'art. 69, 1, sans
  quoi il serait imposé comme un excédent).
- Arriérés du décompte = éléments du mois saisis nature par nature (art. 100) ;
  un montant global déclaré qui les contredit est refusé.
- Le décompte se rapporte au contrat que le registre dit TERMINÉ dans le mois
  (arrêté de 2008, art. 2, « lors de la résiliation ») ; type de contrat lu au
  registre.
- Sommes dues PAR le travailleur (art. 63 al. 3, art. 70) · ni retenues ni
  comptées (art. 112, liste fermée des retenues).
- Stipulation en dollars refusée au décompte (ses rubriques sont en francs).

## Fait

Étapes 1 à 3 (commit « A8 · le décompte final émis, figé et passé au journal »).
Tests · `decompte-final-emis.spec.ts` (règle), `decompte-final-emis-service.spec.ts`
(câblage, coexistence dans les deux sens, passation 6614 / 422).

Étape 4 · écran · onglet « Décompte final » de Personnel, bouton « Émettre le
décompte final » (derrière `peutEcrire`, grisé avec son motif sans salarié
choisi ni mois de cessation, `lib/decompte-emis.ts`), corps unique
`corpsDecompte` pour calculer et émettre, éléments du mois repris de l'onglet
Simulation ; onglet Bulletins · « Décompte final » nommé dans la liste et en
titre du document ouvert.

Étape 5 · bloc du § 3 passé · serveur `npx tsc --noEmit`, `npx jest` (699
suites, 9 580 tests), `npm run build`, `npx prisma generate` ; client
`npx tsc --noEmit`, `npm test` (203 fichiers, 1 636 tests), `npm run build`.

## Premier tour de relecture (2026-10-03), fait

Serveur (commit « A8 · corrections du premier tour, serveur ») ·
- 0 · migration renommée `20270119000000_decompte_final_emis`.
- B2 · `DecompteFinalEmisDto` (`@IsDefined`, `MOTIF_ANCIENNETE_EXIGEE`,
  `MOTIF_MOIS_NON_COUVERTS_EXIGES`), le calcul seul inchangé.
- (g) motifs joints au message (`refusNomme`) ; (h) `pg_advisory_xact_lock`
  par dossier en tête de la transaction de `figerBulletin` ; (i)
  `chiffresFigeables` refuse un null au lieu de `?? 0` ; (j) éléments
  négatifs refusés (`motifsElementsNegatifs`), plus de `Math.max` ; taux légal
  d'allocations déclaré refusé quand le décompte les calcule ; (k) rubriques
  arrondies au centime, totaux comparés après arrondi ; (l) `MOTIF_GRATIFICATION` ;
  (m) `motifsDoubleCompte` (congé, gratification, allocations) ; (n)
  `avertissementsPassation`, rendu dans la réponse et figé dans le calcul ;
  (o) commentaire du 6614 · écart du semis ; (p)
  `RESERVE_INDEMNITES_PERSONNEL_NATIONAL` sur la ligne du 6614 (renvoi au 6624).
- Assiette · `avantagesInclusFc` posé par le moteur, ventilation
  (`VentilationAvantageDto`, `ventilationDesAvantages` côté écran) ou refus ;
  phrase « elle reste donc dans la rémunération » retirée.

Client (commit « A8 · corrections du premier tour, écran ») ·
- B1 · plus aucun effacement des arriérés · motif `MOTIF_ARRIERES_ET_ELEMENTS` ;
  corps construit par `corpsEmissionDecompte` (pur, testé) ; test par
  positions remplacé ; import de `vitest` retiré du spec (il cassait la suite
  Jest de la racine).
- B2 · champs vides envoyés absents, motif avant le clic.
- (a) bouton grisé par `motifDecompteNonEmissible(...) !== null`, mois rogné,
  même garde dans `emettreDecompte` ; (b) l'écran nomme le salarié, le mois et
  le nombre d'éléments repris ; (c) `useRef` contre le double envoi ; (d)
  succès et avertissements vidés au changement de salarié ou de mois, réponse
  tardive jetée par jeton, salarié nommé, liste des bulletins relue à
  l'ouverture de l'onglet Bulletins émis (montage) ; (e) `aria-describedby`,
  `role="status"`, `pattern` et `placeholder` AAAA-MM ; (f) Aide réécrite ;
  avertissements des allocations affichés.

## Reste

- Contrôle de dérive de la migration sur une base jetable (voir étape 1),
  à passer par l'intégrateur ou par le portillon `verifier`.
- Relecture adverse et agents du § 11 (`silent-failure-hunter`,
  `typescript-reviewer`, `react-reviewer`) avant intégration.

## Ce que le corpus ne tranche pas (à remonter)

- Allocations familiales · la nature `ALLOCATIONS_FAMILIALES_LEGALES` reste
  sans compte (P3, aucune fiche du 66 ne le nomme) · un décompte qui en porte
  s'ÉMET, mais la paie du mois qui le contient est refusée à la passation,
  comme un bulletin qui en porte.
- Versement unique · la loi n° 23/053 ne prévoit ni étalement ni taux
  distinct pour les sommes de rupture (art. 68, 6° les rend imposables) ;
  barème du mois appliqué par décision, réserve écrite.
- Intitulé du 66140000 au semis SYCEBNL (« préavis et de licenciement ») plus
  court que la fiche du compte 66 du même texte (« et de recherche
  d'embauche ») · écart du SEMIS (`compte-seed.ts`), non retouché.
- Assiette sociale de l'indemnité de fin de contrat · corpus muet, lecture
  d'OmegaX (gardée dans l'assiette), réserve sur la ligne.

## Vérification

```bash
npx tsc --noEmit && npx jest src/modules/personnel && npx jest
npm run build
cd client && npx tsc --noEmit && npm test && npm run build
```
