# AVANCEMENT A9 · décompte final, art. 66 et 67 du Code du travail

Ligne A9 de `docs/suivi-immobilisations-verrouille.md` · relevé CPCC C5
(`docs/releve-seminaires-cpcc-2026-10-02.md`). Branche de sauvegarde
`travail/a9`, partie de `main` (8e15ce7, A8 intégré).

## Textes lus (compétence `droit-travail-congolais`, Code du travail verbatim)

- art. 63, al. 3 · indemnité de préavis non observé, par la partie responsable.
- art. 64 · préavis de l'employeur, moitié pour le travailleur.
- art. 65 · obligations réciproques pendant le préavis, jour de liberté.
- art. 66 · « Le travailleur qui reçoit le préavis peut cesser le travail à
  l'expiration de la moitié du délai de préavis que l'employeur est tenu de lui
  donner. L'employeur doit la rémunération et les allocations familiales
  pendant le temps restant à courir. » + al. 3 (moyenne des douze mois).
- art. 67 · nouvel emploi justifié, délai moindre de commun accord, « sans qu'il
  puisse être supérieur à sept jours à dater du jour où il trouve un nouvel
  engagement », perte de la rémunération et des allocations du reste.
- art. 7, point 8 (rémunération, exclusions) et point 9 (jour ouvrable).

## Fait

- (en cours)

## Reste

- moteur, DTO, service, écran, tests, bloc du § 3.

## Commandes de vérification

```bash
npx jest src/modules/personnel --maxWorkers=2
npx tsc --noEmit
(cd client && npx tsc --noEmit && npx vitest run src/lib/decompte-emis.spec.ts)
```
