# AVANCEMENT · ligne A7 ter (défauts de production d'A7, créances douteuses)

Branche de sauvegarde · `travail/a7ter`, partie de `origin/main` (ab53edc).
Fiche retirée à l'intégration.

## Reste à faire

- [x] B1 · l'à-nouveau PROVISOIRE n'arrête plus la chaîne ni ne sert de solde
- [ ] B3 · la ligne C 411 d'un reclassement hors du lettrage (automatique, pré-lettrage, manuel)
- [ ] B2 (a) · `TIERS_ANCIEN_NON_LETTRE` écarte les écritures tenues par une créance douteuse
- [ ] B2 (b) · le module lettre ses lignes 416 à l'extinction, et défait ce lettrage à l'annulation
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

## Décisions prises, avec leur source

- B1 · même parti que la ligne A5 (`DevisesService.ouverturesDe`) · seul l'à-nouveau provisoire, calculé sur le
  seul livre-journal (point 11), cède la place à la clôture précédente reconstituée.

## Vérification

```bash
npx tsc --noEmit && npx jest src/modules/creances-douteuses src/modules/lettrage src/modules/controles
cd client && npx tsc --noEmit && npm test
```
