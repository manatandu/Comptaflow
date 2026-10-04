# AVANCEMENT · ligne A18 (relevé CPCC C15)

Décompte final · déduction des avances et prêts, gratification au prorata
proposée, indemnité de fin de contrat stipulée (Code du travail art. 64, 112).
Branche locale `travail-a18`, sauvegarde `travail/a18`, partie de `main` f46165b.
Aucune migration (le décompte vit dans le JSON figé du bulletin).

## Textes lus (droit-travail-congolais, texte verbatim)

- Art. 112 · retenues autorisées : c) avances, f) prêt, g) saisie-arrêt ; la
  limite de l'art. 114 ne vise QUE le litera d). Aucun plafond pour c et f.
- Art. 7, point 8 · « Les sommes versées à titre de gratification ou de mois
  complémentaires » sont de la rémunération ; aucun article n'impose d'en verser.
- Art. 37, al. 2 · clause moins favorable nulle ; art. 64, al. 1er · « sauf
  durée plus longue fixée par les parties ou par la convention collective ».
- Art. 66 · gratifications comptées dans la moyenne des douze mois (déjà codé).

## Décisions (tranchées par la loi)

1. Le texte ne contredit pas la ligne : retenue des soldes d'avance (c) et de
   prêt (f) autorisée sans plafond légal ; bornée au solde (au-delà, réduction
   de rémunération, art. 112 al. 1er) et au net (net négatif refusé, déjà en
   place). PROPOSÉE (avances puis prêts, plus ancien d'abord), le cabinet
   confirme. Prêt · réserve : l'exigibilité du solde entier à la rupture relève
   du contrat de prêt, aucun article lu ; elle est figée sur le document émis.
2. Saisie-arrêt jamais proposée (l'acte fixe la retenue, AUPSRVE art. 184, 188).
3. Un solde que le décompte ne retient pas reste dû au registre · AVERTISSEMENT
   à l'émission (réponse et document), jamais un refus.
4. Gratification · rien sans stipulation (null, jamais zéro) ; stipulée (montant
   annuel, source, période de référence au plus douze mois, finie au plus tard à
   la fin du contrat), prorata PROPOSÉ = annuel × mois ENTIERS de service date à
   date / 12 (lecture d'OmegaX, dite) ; le cabinet confirme en saisissant le
   montant retenu (différence admise et dite). Source manquante · refus nommé.
5. Indemnité stipulée · montant + source, jamais calculée, rubrique
   `indemnite-stipulee`, nature `INDEMNITE_DE_FIN_DE_CONTRAT` (66140000),
   s'ajoute aux sommes légales.

## Fait

- [x] Règles pures `src/modules/personnel/decompte-retenues-stipulations.ts` + spec.
- [x] Moteur `decompte-final.ts` (proposition de gratification, indemnité
      stipulée), `decompte-final-emis.ts` (nature, motif de refus) + `decompte-final-a18.spec.ts`.
- [x] Service · `preparerDecompteFinal` (refactor), `proposerRetenuesDecompte`
      (net rejoué sans retenue), `avancesARetenir` (bornée, dite), avertissements
      des soldes restants, route `POST /personnel/salaries/:id/decompte-final/retenues-proposees`
      (`@Roles` admin, comptable, lecture seule) ; doublure honorant le `where`.
- [x] Client · stipulations saisies, « Reprendre la proposition », « Proposer les
      retenues d'avance » puis « Reprendre dans la paie du mois » (`lib/decompte-emis.ts`, spec).
- [x] Rejeu sur vraie base (PG 16, base `a18_1`, serveur compilé, port 8101),
      SYSCOHADA et SYCEBNL, à travers la clôture de 2026 : prêt 600 000 (juin
      2026), 100 000 retenus en novembre 2026 (passé au journal), avance 300 000
      (décembre 2026), N clôturé ; contrat fini le 2027-02-28 · gratification
      proposée 200 000 (1 200 000 × 2 / 12), retenues proposées 300 000 + 500 000,
      total versé 2 051 000, net 853 350 ; en N+1 · 4211 et 2728 soldés à zéro,
      6614 débit 1 205 000 (805 000 + 400 000), 6612 débit 200 000, 422 crédit
      403 900 + 853 350. Aucun écart.

## Reste

- [ ] Relectures (comptable, échecs silencieux) et intégration sur `main`.

## Vérification

```
npx jest src/modules/personnel/decompte
cd client && npx vitest run src/lib/decompte-a18.spec.ts
```
