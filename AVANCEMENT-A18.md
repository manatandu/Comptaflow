# AVANCEMENT · ligne A18 (relevé CPCC C15)

Décompte final · déduction des avances et prêts, gratification au prorata
proposée, indemnité de fin de contrat stipulée (Code du travail art. 64, 112).
Branche locale `travail-a18`, sauvegarde `travail/a18`, partie de `main` f46165b.

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
   place). PROPOSÉE, le cabinet confirme. Prêt · réserve : l'exigibilité du
   solde entier à la rupture relève du contrat de prêt, aucun article lu.
2. Saisie-arrêt jamais proposée (l'acte fixe la retenue, AUPSRVE art. 184, 188).
3. Gratification · rien sans stipulation (null, jamais zéro) ; stipulée (montant
   annuel, source, période de référence ≤ 12 mois), prorata PROPOSÉ = annuel ×
   mois ENTIERS de service date à date / 12 (lecture d'OmegaX, dite) ; le cabinet
   confirme en saisissant le montant retenu.
4. Indemnité stipulée · montant + source, jamais calculée, nature
   `INDEMNITE_DE_FIN_DE_CONTRAT` (66140000), s'ajoute aux sommes légales.

## Fait

- [x] Règles pures `src/modules/personnel/decompte-retenues-stipulations.ts` + spec.

## Reste

- [ ] Câblage moteur du décompte (rubriques indemnité stipulée, proposition de gratification).
- [ ] Service · route de proposition des retenues (net rejoué), avertissement des soldes restants à l'émission.
- [ ] Client · écran du décompte.
- [ ] Rejeu sur vraie base à travers une clôture.
- [ ] Bloc § 3 complet.

## Vérification

```
npx jest src/modules/personnel/decompte-retenues-stipulations.spec.ts
```
