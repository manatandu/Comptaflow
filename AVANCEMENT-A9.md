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
- art. 7, point 8 (rémunération : comprend la valeur des avantages en nature,
  exclut logement ou son indemnité, transport, allocations familiales) et
  point 9 (jour ouvrable).

## Fait

- Moteur (`decompte-final.ts`) · deux exécutions nouvelles du préavis,
  `DEPART_A_MI_PREAVIS` (art. 66) et `DEPART_POUR_NOUVEL_EMPLOI` (art. 67),
  refusées hors préavis donné par l'employeur (`motifRefusDecompte`).
- Art. 66 · rubrique « Rémunération du préavis restant à courir » = jours
  restants × (taux journalier + moyenne de l'art. 66, al. 3) + avantages en
  nature (`avantagesEnNatureRestantsFc`) ; jours restants > moitié refusés
  (null, renvoi à l'art. 63 ou 67) ; tout fait non déclaré = null.
- Art. 67 · rubrique à zéro (perte du reste), rien dû par le travailleur ;
  justification (`nouvelEmploiJustifie`) et délai convenu
  (`delaiDepartNouvelEmploiJours`, au plus 7, compris) exigés, sinon null.
- Relevé C5 · « non observé, responsable le travailleur » sur un préavis reçu
  de l'employeur · parti à la moitié ou après, la rubrique reste DUE au
  travailleur et indéterminée, renvoi à l'art. 66 (solde non émis) ; parti
  avant, seuls les jours d'avant la moitié lui sont imputés, réserve
  `RESERVE_DEPART_AVANT_LA_MOITIE`. La démission n'est pas touchée.
- Allocations familiales · réserve « dues (art. 66, al. 2) » ou « perdues
  (art. 67) » sur la ligne, jours toujours saisis.
- DTO, service (câblage), émission (nature 6614 commentée), écran Personnel
  (options désactivées sur initiative du travailleur, champs, bulles Aide).
- Specs · `src/modules/personnel/decompte-articles-66-67.spec.ts`,
  `client/src/pages/decompte-articles-66-67.spec.ts`.

## Décisions et lectures (par la loi la plus proche)

- La rémunération du temps restant (art. 66, al. 2) va au 6614 sous
  `INDEMNITE_DE_FIN_DE_CONTRAT` · fiche du compte 66, « indemnités de
  préavis » ; part du préavis payée sans travail.
- « Rémunération » de l'art. 66 lue au sens de l'art. 7, point 8 · ni
  logement ni transport (l'art. 63, al. 3 dit « avantages de toute nature »,
  l'art. 66 ne le dit pas).
- « Sept jours » de l'art. 67 · jours de calendrier (l'art. 64 écrit « jours
  ouvrables » quand il les veut).
- Départ AVANT la moitié d'un préavis reçu · non réglé expressément par le
  Code ; l'art. 66, al. 1 fixant à la moitié le délai à observer, seuls les
  jours d'avant elle sont imputés (art. 63, al. 3), et l'art. 66, al. 2 ne
  joue pas. Lecture d'OmegaX, écrite sur la ligne.
- Aucune migration · le décompte n'est stocké que figé dans le bulletin (JSON).

## Reste

- Bloc du § 3 complet des deux côtés (en cours à la fin).

## Commandes de vérification

```bash
npx jest src/modules/personnel --maxWorkers=2
npx tsc --noEmit
(cd client && npx tsc --noEmit && npx vitest run src/pages/decompte-articles-66-67.spec.ts)
```
