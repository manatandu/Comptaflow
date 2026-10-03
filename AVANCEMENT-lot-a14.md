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

Rejeu sur vraie base (`lot14_1`, API compilée, port 8098), SYSCOHADA et
SYCEBNL · N 2025 (camion 1 200 000 et armoire 600 000 sur 5 ans, dotations
240 000 et 120 000, clôture), N+1 2026 · refus sans pièce (400), vente
sans prix et restitution hors projet refusées avec leur motif ; vol au
30/06 (complément 120 000, VNC 840 000) et vente au 30/09 (complément
90 000, VNC 390 000, prix 400 000) · 81 = 1 230 000, 82 = 400 000, 2845 et
245 soldés, 681 = 210 000 ; libellés « Mise hors service (vol) » et
« Cession (vente) », référence de la pièce sur les quatre écritures. Tout
concorde des deux côtés.

Reste · rien pour A14.

## A12 · intérêts courus sur emprunts (relevé CPCC C8)

Fait
- Réemploi du module des régularisations · nature du tiers `PRETEURS` de la
  charge à payer, `compteEmpruntId` exigé ; `regularisation/interets-courus.ts`
  résout le compte d'intérêts courus sur l'emprunt et juge la charge.
  Constatation au dernier jour (D 671x ou 674x / C 166x ou 186x), reprise
  existante à l'ouverture de N+1 (ligne à ligne). Aucune migration.
- Écran · nature « Prêteurs », liste des emprunts admis, charge proposée
  (`client/src/lib/interets-courus.ts`, miroir rejoué par son spec).

Décisions et textes
- AUDCIF Titre VII, fiche du compte 16 · « crédité, à la clôture […] des
  intérêts courus jusqu'au jour de la clôture, par le débit du compte 671 » ;
  « débité, à l'ouverture […] par le crédit du 671 ». SYCEBNL Partie 2 ch. 3,
  fiche du compte 18, même phrase ; son 16 est un fonds.
- Un numéro, deux plans · 16x vers 166x (1661 à 1665, 1667, 1668) ; 18x vers
  186x (1861, 1862, 1863, 1865, 1868).
- Refus · SYCEBNL 184 (la fiche n'ouvre aucun 1864, anomalie non comblée,
  écriture à la main) ; 1681 (Titre VIII ch. 11, aucune distinction intérêts
  et capital) ; 17, 18 SYSCOHADA et 187 SYCEBNL (hors compte 16).
- Charge · 6711 et 6712 (fiche du 16, « 671 ») ; 6741, 6742, 6748 (fiche du
  67, avances, dépôts, comptes courants, dettes diverses). Refusés 6713,
  6714, 6743 à 6745. Proposée seulement si l'intitulé nomme la même dette.
- Montant DÉCLARÉ (aucun taux) ; période close au plus tard à la clôture.

Rejeu sur vraie base, SYSCOHADA et SYCEBNL · prêt 10 000 000 au 162 / 182,
intérêts payés 300 000 en juin 2025, 150 000 courus rattachés à la clôture ·
N : 6712 = 450 000, 1662 / 1862 créditeur de 150 000 ; clôture ; N+1 :
reprise au 01/01/2026, intérêts courus soldés, 6712 = 450 000 D / 150 000 C,
net 300 000 ; refus charge 6744, période au-delà de la clôture, sans
emprunt, et au SYCEBNL le 16 pris pour emprunt. Tout concorde.

Reste · rien pour A12.

## A16 · registre des provisions, moins d'un an et conditions propres

À faire.

## Vérification

```bash
npx tsc --noEmit && npx jest src/modules/immobilisations/nature-sortie src/modules/immobilisations/sortie-f27
cd client && npx tsc --noEmit && npx vitest run src/lib/nature-sortie.spec.ts
```
