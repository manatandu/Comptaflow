# AVANCEMENT · ligne A7 ter (défauts de production d'A7, créances douteuses)

Branche de sauvegarde · `travail/a7ter`, partie de `origin/main` (ab53edc).
Fiche retirée à l'intégration. Migration · `20270125000000_creances_douteuses_lettrage_module`
(A5 bis porte 20270124000000 et s'intègre avant).

## Reste à faire

Premier passage (fait, 1d8b94f) · B1, B2 (a), B2 (b), B3, m3 à m10, écran, e2e.

Premier tour de relecture adverse (2026-10-03) ·

- [x] BLOQUANT B2b · une période close après l'extinction n'enferme plus la créance
- [x] mineur 1 · règlement d'une créance reclassée (avertissement, constat, 416 hors des échéances)
- [x] mineur 2 · position en devise jugée nette, par compte et par devise
- [x] mineur 3 · messages · le report provisoire n'est jamais lu, ne plus proposer de le relancer
- [x] mineur 4 · déclaration bornée par le report reconstitué · `borneProvisoire` et information
- [x] mineur 5 · part du 491 hors module lue sur l'exercice seul (cas du -400 000)
- [x] mineur 6 · B3 seulement avec une TVA facturée (443)
- [x] mineur 7 · groupe MANUEL jamais défait ; retrait en une transaction ; ré-extinction
- [x] mineur 8 · méthode des cotisations du jour ; impayé d'adhérent admis avec avertissement
- [x] mineur 9 · B2a restreinte ; index `compteCreanceId` ; citation CPCC ; CLAUDE.md
- [x] fusion de `origin/main` (f4ab9bb), puis bloc du § 3 des deux côtés · serveur `tsc` vert, `npx jest
  --maxWorkers=2` 714 suites, 9 997 tests (deux suites tuées par le système, SIGKILL mémoire, rejouées seules et
  vertes · `graphe-applicatif`, `classeur-en-memoire-borne`), `npm run build` vert ; client `tsc` vert, 208
  fichiers, 1 697 tests, construction verte ; e2e typé · le parcours sur base réelle reste à la CI

## Fait (premier tour)

- B2b · origine `MODULE` du groupe posé par le module (enum, migration) · `groupeDuModule` exige cette
  origine et des lignes 416 de LA créance (reclassement, mouvements annulés compris, leurs négatifs,
  `ecrituresDeLaCreance`), et dit s'il est FIGÉ (`lignesFigees`). Figé · il reste en place, l'annulation
  (mouvement ou reclassement) s'inscrit en négatif en le tolérant (`motifLignesTenues(..., groupeTolere)`,
  `inscrireEnNegatifPourAnnulation(..., { groupeTolere })`), trace `lettrageMaintenu` et information à
  l'écran ; au brouillard, refus nommé « validez l'écriture puis annulez » (annulation et retrait). Spec du
  scénario exact sur base en mémoire avec la VRAIE inscription en négatif
  (`periode-close-apres-extinction.spec.ts` · 651 à zéro, 416 à 400 000 sur la seule ligne ouverte ; le
  recouvrement du 30/11 annulé au 01/12, date de valeur 30/11) ; e2e sur base réelle (clôture de période
  au 30/11, annulation de la dernière perte, balance 416 et 651).
- Mineur 7 · `defaireLettrageDuModule` refuse un groupe d'une autre origine ; `retirerMouvement` passe
  `lettrageTolere` à `EcritureService.supprimer`, qui le défait dans `liberer` et relit les lignes dans la
  transaction ; `lettrerSiEteinte` ne lettre que les lignes OUVERTES (le négatif d'une perte annulée avec la
  perte repassée) ; `confirmerPreLettrage` refuse l'origine `MODULE`.
- Mineur 2 · `positionEnDeviseOuverte` · deux `groupBy` par sens (débit ou crédit négatif, crédit ou débit
  négatif), net par compte et devise.
- Mineur 3 · `motifSoldeReconstitue`, `libelleSoldesProvisoires`, bulle de l'écran.
- Mineur 4 · `declarer` rend `borneProvisoire` et `INFORMATION_BORNE_RECONSTITUEE`, affichée.
- Mineur 5 · `horsModule491` sur `exerciceId = ex.id`.
- Mineur 6 · `lignesAvecTvaFacturee`, `lignesTaxeesDuCompte`, `refuserLignesDuCompteClientReclasse(…, dejaDuGroupe)` ;
  `calculerPropositions` en deux passes (`apparier`) · sans les reclassements, puis avec eux sans les pièces
  taxées. L'e2e porte sa TVA (44310000).
- Mineur 8 · `estImpayeAdherent`, `METHODE_DU_JOUR`, avertissement qui cite la fiche 41 et le § 5.4.2.1, servi
  au reclassement, à la déclaration et à la liste des comptes.
- Mineur 9 · `estFactureDUneCreanceReclassee` (443, ligne ouverte, datée au plus tard du dernier reclassement) ;
  index dans la migration (diff schéma contre schéma identique à la SQL) ; citations CPCC ch. 6 § 2 recopiées
  de la compétence ; paragraphe A7 de CLAUDE.md (m7 et A7 ter), `cadratins` et `reglement-interieur` verts.
- Mineur 1 · 416 dans `DIVISIONS_EXCLUES`, `motifHorsEcheance` ; `avertissementCreanceReclassee` au règlement,
  `creanceReclassee` servi aux échéances et dit à l'écran ; `COMPTE_CREANCE_RECLASSEE_CREDITEUR` (information),
  ces comptes sortis de `TIERS_SOLDE_INVERSE`. Le reste écrit à la ligne A7 bis du suivi.

## Décisions prises, avec leur source

- B2b · AUDCIF art. 20, al. 2 (inscription en négatif) et art. 22, 4° (premier jour non clôturé, date de
  valeur) ; `gel-cloture.ts` (Sage i7 · Totale et Période figent le lettrage) · un groupe figé n'est pas
  défait, et ce qu'il affirme reste vrai (ses lignes soldent entre elles).
- Mineur 6 · fiche du compte 44 des deux plans (443 « TVA facturée », relu dans les deux compétences et les
  deux semis) ; O.-L. n° 10/001, art. 25, 2° et décret n° 011/42, art. 57 · sans 443, aucune TVA ne devient
  exigible par le lettrage.
- Mineur 1 · fiche du compte 41 des deux plans (416, créances litigieuses ou douteuses) · son encaissement
  est le recouvrement du module.
- Mineur 5 · même règle que l'à-nouveau · sans à-nouveau, la chaîne antérieure tient lieu d'ouverture.
- Mineur 8 · fiche SYCEBNL du compte 41 (413 des valeurs revenues impayées) contre cadre conceptuel § 5.4.2.1 ·
  aucun texte ne tranche, rien tranché n'est pas bloqué (CLAUDE.md, cotisations) · avertissement.
- Mineur 9 (B2a) · restreindre plutôt que nommer le compte une fois · la pièce que le cabinet doit retrouver
  reste nommée, une vente postérieure ou sans TVA n'est plus annotée à tort.
- Mineur 9 · CPCC ch. 6 § 2 (compétence `organisation-comptable-cpcc`) · « À chaque règlement enregistré, le
  système impose d'enregistrer en même temps le code de la facture réglée ».

## Reste à Manasse

- D7 du suivi · impayé d'adhérent (4131, 4133) sous la méthode de l'encaissement, admis avec avertissement.
- A7 bis · groupes facture-reclassement déjà posés sur une facture taxée (à relever et défaire) ; TVA de
  l'encaissement d'une créance reclassée passé par le module ; règlement déjà passé au compte d'origine,
  corrigé à la main.

## Vérification

```bash
npx tsc --noEmit && npx jest src/modules/creances-douteuses src/modules/lettrage src/modules/controles src/modules/reglements src/modules/comptabilite
npx jest cadratins reglement-interieur --maxWorkers=1
cd client && npx tsc --noEmit && npm test
cd e2e && npx tsc --noEmit -p .
```
