# AVANCEMENT · ligne A7 ter (défauts de production d'A7, créances douteuses)

Branche de sauvegarde · `travail/a7ter`, partie de `origin/main` (ab53edc).
Fiche retirée à l'intégration.

## Reste à faire

- [x] B1 · l'à-nouveau PROVISOIRE n'arrête plus la chaîne ni ne sert de solde
- [x] B3 · la ligne C 411 d'un reclassement hors du lettrage (automatique, pré-lettrage, manuel)
- [x] B2 (a) · `TIERS_ANCIEN_NON_LETTRE` écarte les écritures tenues par une créance douteuse
- [x] B2 (b) · le module lettre ses lignes 416 à l'extinction, et défait ce lettrage à l'annulation
- [x] m3 · SYCEBNL, le 651 croisé refusé comme le 416 (E3)
- [x] m4 · déclaration d'ouverture · devise, compte non détail ou inactif refusés
- [x] m5 · listes 416 et 491 · `tronque` et total
- [x] m6 · bouton « Retirer » servi par le serveur
- [x] m7 · retrait d'un mouvement réservé au comptable
- [x] m8 · rapprochement du 491 · part hors module nommée
- [x] m9 · SYCEBNL, méthode des cotisations à l'encaissement · reclassement d'adhérent refusé
- [x] m10 · rapprochement par exercice, jamais `null` pour toujours
- [x] Écran · rapprochement (report provisoire, hors module), `retirable`, `listes416491`, cotisations,
  `lettrage416`, retrait d'un mouvement sous `peutValider`
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

- Mineurs, serveur · m3 `motifRefus651Croise` ; m4 refus devise, regroupement, sommeil à la déclaration ; m5
  `listes416491` (plafond 200, totaux) ; m6 `motifNonRetirable` + `retirable` servi ; m7 `@ReserveAuComptable` sur
  `DELETE :id/mouvements/:mouvementId` ; m8 `horsModule491` ; m9 refus ENCAISSEMENT (reclassement et déclaration),
  avertissement si non déclarée ; m10 `rapprochementDuModule` par agrégat. Écran à aligner (reste à faire).

- Écran · `ecartsRapprochement`, `libelleSoldesProvisoires`, `messageLettrage416` (lib) ; bandeau d'information
  après le geste (lettrage du 416, avertissement des cotisations) ; `retirable` servi ; retrait d'un mouvement sous
  `peutValider` ; listes 416 et 491 tronquées dites ; refus et avertissement des cotisations sous le compte choisi.

## Décisions prises, avec leur source

- B1 · même parti que la ligne A5 (`DevisesService.ouverturesDe`) · seul l'à-nouveau provisoire, calculé sur le
  seul livre-journal (point 11), cède la place à la clôture précédente reconstituée.
- B2 (b) · origine `AUTOMATIQUE_PIECE` (aucune migration) · appariement « a priori » du CPCC, ch. 6 (chaque mouvement
  porte la créance qu'il solde). Rien n'est lettré pour une créance déclarée (montant dans l'à-nouveau, sans ligne
  à elle) ni à travers deux exercices (passé la clôture, la ligne se lettre sur son report Détail, que la liaison
  ne désigne pas) · le motif le dit. Le module ne lettre que le 416, sans TVA (aucune ligne 443).
- m3 · fiche SYCEBNL du compte 65 (« 6511 Clients - usagers, 6512 Adhérents, 6515 Autres débiteurs ») · règle par
  ANALOGIE avec E3 (fiche du compte 41), dite dans le message ; rien au SYSCOHADA.
- m9 · cadre conceptuel SYCEBNL § 5.4.2.1 · ENCAISSEMENT = pas de droit d'agir, une cotisation impayée n'est pas une
  créance · refus au reclassement ET à la déclaration (jumeau) ; non déclarée · avertissement, jamais un refus.
- m8 · « hors module » = lignes de la chaîne sur les 491 du module, hors à-nouveau, hors écritures de revue et leurs
  négatifs ; l'à-nouveau mêle les deux, son reliquat reste nommé comme tel à l'écran.

## Vérification

```bash
npx tsc --noEmit && npx jest src/modules/creances-douteuses src/modules/lettrage src/modules/controles
cd client && npx tsc --noEmit && npm test
```
