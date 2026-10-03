# AVANCEMENT · ligne A7 ter (défauts de production d'A7, créances douteuses)

Branche de sauvegarde · `travail/a7ter`, partie de `origin/main` (ab53edc).
Fiche retirée à l'intégration.

## Reste à faire

- [x] B1 · l'à-nouveau PROVISOIRE n'arrête plus la chaîne ni ne sert de solde
- [x] B3 · la ligne C 411 d'un reclassement hors du lettrage (automatique, pré-lettrage, manuel)
- [x] B2 (a) · `TIERS_ANCIEN_NON_LETTRE` écarte les écritures tenues par une créance douteuse
- [x] B2 (b) · le module lettre ses lignes 416 à l'extinction, et défait ce lettrage à l'annulation
- [ ] m3 · SYCEBNL, le 651 croisé refusé comme le 416 (E3)
- [ ] m4 · déclaration d'ouverture · devise, compte non détail ou inactif refusés
- [ ] m5 · listes 416 et 491 · `tronque` et total
- [ ] m6 · bouton « Retirer » servi par le serveur
- [ ] m7 · retrait d'un mouvement réservé au comptable
- [ ] m8 · rapprochement du 491 · part hors module nommée
- [ ] m9 · SYCEBNL, méthode des cotisations à l'encaissement · reclassement d'adhérent refusé
- [ ] m10 · rapprochement par exercice, jamais `null` pour toujours
- [ ] Bloc du § 3 des deux côtés, `npx jest --maxWorkers=2` en fin

## Fait

- B1 · `A_NOUVEAU` exclut `estANouveauProvisoire` ; `solde`, `comptes`, le contrôle de devise et la borne de la
  déclaration (`soldesALOuverture`, report reconstitué brouillard compris) l'excluent ; refus et écran disent
  « report provisoire, relancez-le après validation » (`motifSoldeReconstitue`, `rapprochement.reportProvisoire`).

- B3 · `lettrage/ligne-de-reclassement.ts` · la ligne du compte d'ORIGINE d'un reclassement en vigueur, reconnue par
  liaison, est écartée de `calculerPropositions` et refusée par `lettrerManuel`, `completer`, `confirmerPreLettrage`
  (une ligne d'appel chacun, rien d'autre de réécrit · fusion simple avec A6 bis). Tests à part
  (`ligne-de-reclassement.spec.ts`).

- B2 (a) · `controles.service.ts` · `estTenueParUneCreanceDouteuse` (liaisons reclassement, mouvement, revue, acte
  et créance non annulés) sort l'écriture du contrôle ; la facture d'un compte d'origine en vigueur est nommée
  (`surLeCompteDUneCreanceReclassee`), lu dans la MÊME lecture (select imbriqué, aucune doublure à compléter).

- B2 (b) · `lettrerSiEteinte` (après chaque perte ou recouvrement) pose par `LettrageService.lettrerLignesDuModule`
  le groupe des lignes 416 (reclassement + mouvements non annulés) quand le reste est nul ; issue rendue
  (`lettrage416`), jamais d'échec du geste ; `annulerMouvement` et `retirerMouvement` défont le groupe du module
  (`groupeDuModule`, `defaireLettrageDuModule`) ; un groupe manuel avec une ligne étrangère n'est jamais défait.

## Décisions prises, avec leur source

- B1 · même parti que la ligne A5 (`DevisesService.ouverturesDe`) · seul l'à-nouveau provisoire, calculé sur le
  seul livre-journal (point 11), cède la place à la clôture précédente reconstituée.
- B2 (b) · origine `AUTOMATIQUE_PIECE` (aucune migration) · appariement « a priori » du CPCC, ch. 6 (chaque mouvement
  porte la créance qu'il solde). Rien n'est lettré pour une créance déclarée (montant dans l'à-nouveau, sans ligne
  à elle) ni à travers deux exercices (passé la clôture, la ligne se lettre sur son report Détail, que la liaison
  ne désigne pas) · le motif le dit. Le module ne lettre que le 416, sans TVA (aucune ligne 443).

## Vérification

```bash
npx tsc --noEmit && npx jest src/modules/creances-douteuses src/modules/lettrage src/modules/controles
cd client && npx tsc --noEmit && npm test
```
