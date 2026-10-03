# Avancement · lot A14, A12, A16

Branche de sauvegarde `travail/lot-a14`, partie de `main` c7a73b4.

## A14 · nature et pièce de la sortie d'immobilisation (relevé CPCC C11)

Fait
- `src/modules/immobilisations/nature-sortie.ts` · liste fermée, refus, libellé.
- Migration `20270127000000_nature_et_piece_de_sortie` (enum + trois colonnes
  nullables sur `immobilisations`), contrôle de dérive « No difference ».
- `SortirImmobilisationDto` exige nature, référence et date de la pièce ;
  `SortieImmobilisation` pour les appels internes ; `sortir` refuse avant le
  verrou, pose les trois champs, les défait avec la sortie, recopie la nature
  au libellé et la référence aux écritures (complément, sortie, produit).
- L'échange déclare `ECHANGE` par son geste ; renouvellement et levée
  d'option restent sans nature (ils portent leur propre pièce).
- Écran · `client/src/lib/nature-sortie.ts`, champs Nature, Pièce, Date de la
  pièce sur la sortie ; e2e mis à jour.

Décisions et textes
- Natures · fiche du compte 81 des deux plans (« vente, échange, mise au
  rebut ou destruction ») ; AUDCIF Titre V § 5.8 et SYCEBNL cadre conceptuel
  § 5.5 (« vol, disparition ») ; SYCEBNL Partie 3 ch. 3 § 2.5.2 et § 2.5.3
  (remise gratuite, restitution), restitution aussi pour l'usufruit
  rétrocédé (Partie 3 ch. 2 § 2.3.2).
- PILLAGE · aucun texte lu ne le nomme · déclaré en VOL, la pièce le décrit.
- Pièce · AUDCIF art. 17, 3° et 5° · référence et date exigées, document non
  typé (la fiche du 81 nomme PV de mise au rebut, facture, PV de destruction).

Reste · rejeu sur vraie base à travers une clôture.

## A12 · intérêts courus sur emprunts

À faire.

## A16 · registre des provisions, moins d'un an et conditions propres

À faire.

## Vérification

```bash
npx tsc --noEmit && npx jest src/modules/immobilisations/nature-sortie src/modules/immobilisations/sortie-f27
cd client && npx tsc --noEmit && npx vitest run src/lib/nature-sortie.spec.ts
```
