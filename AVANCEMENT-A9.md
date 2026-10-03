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
- Aucune migration · le décompte n'est stocké que figé dans le bulletin (JSON).

## Premier tour de relecture (2026-10-03), corrigé

- B1 · l'art. 67 lit les jours restant à courir CONTRE LA MOITIÉ de l'art. 66
  (lecture protectrice retenue par le coordinateur, CLAUDE.md P5 · « une
  règle de protection ne se tranche pas contre celui qu'elle protège ») · le
  texte ne dit pas à quoi le délai est « moindre », c'est écrit en
  commentaire. Jours restants exigés (`null` s'ils manquent) ; à la moitié
  ou après, `null` et renvoi au départ à mi-préavis (28 jours, 8 restants,
  10 000 FC · 80 000 FC sous l'art. 66, jamais zéro).
- M1 à M8 · étiquette et aide des avantages des jours d'avant la moitié ;
  ventilation et champ des avantages du préavis là où sa rubrique en porte,
  refus du serveur qui nomme le champ ; réserve des allocations familiales
  bornée à la rubrique effective, « non dues » avant la moitié, aide
  conditionnelle, départs refusés hors préavis de licenciement ; somme de
  l'art. 66 sous sa propre clé (`remuneration-preavis-restant`) et sa réserve
  de rémunération (loi n° 23/053, art. 68, al. 1er et 1°, le 6° y menant
  aussi) ; moitié tirée du plancher dite (art. 64, al. 1 et 3) ; exclusions
  complètes de l'art. 7, point 8 et avantages non fournis ; délai en jours de
  calendrier ; art. 65, al. 3 dans la réserve du départ avant la moitié.

## Ce que le corpus ne tranche pas (à remonter à Manasse)

Lu · Code du travail, art. 7 (points 8 et 9), 63 à 68, 138, 141, 142, 144.
Rien de plus n'est codé pour ces quatre points.

- (4) / T2 · LE DÉPART AVANT LA MOITIÉ D'UN PRÉAVIS REÇU. L'art. 66, al. 1
  ouvre la cessation « à l'expiration de la moitié » ; l'art. 63, al. 3 fait
  indemniser « le délai de préavis qui n'a pas été effectivement respecté »
  par la partie responsable ; aucun texte ne dit lequel des deux délais le
  travailleur parti trop tôt n'a pas respecté. Trois lectures, sur un préavis
  de 28 jours (moitié au jour 14).
  (a) Retenue par OmegaX · il doit les seuls jours d'avant la moitié, et
  l'employeur ne doit pas le temps restant (art. 66, al. 2 sans départ à la
  moitié). Parti au jour 13 · il doit 1 jour ; au jour 14 · l'employeur lui
  doit 14 jours. Saut de 15 jours entre deux départs à un jour d'écart.
  (b) Lecture littérale de l'art. 63, al. 3 · il doit tout ce qui n'est pas
  observé. Jour 13 · il doit 15 jours ; jour 14 · on lui doit 14 jours. Saut
  de 29 jours.
  (c) L'art. 66 lui reste acquis, diminué de la faute · il doit le jour
  manquant avant la moitié, et l'employeur lui doit les 14 jours d'après.
  Continu, mais le texte ne garde l'al. 2 qu'à qui cesse « à l'expiration de
  la moitié ».
  L'art. 65, al. 3 (aucun délai imposable à la partie dont les obligations
  n'ont pas été respectées) est rappelé dans la réserve, rien n'est calculé.
- T3 · LES AVANTAGES EN NATURE DU TEMPS RESTANT. L'art. 66, al. 2 dit « la
  rémunération » ; l'art. 7, point 8 y compte « la valeur des avantages en
  nature » et en sort soins de santé, logement, allocations familiales,
  transport, frais de voyage et avantages de fonction. Aucun texte ne dit si
  l'employeur doit continuer de FOURNIR un avantage en nature (véhicule,
  logement) jusqu'au terme, ou en payer la valeur · OmegaX demande la valeur
  des seuls avantages non fournis jusqu'au terme (sinon payés deux fois).
- T4 · LA DATE DE FIN DU CONTRAT SOUS L'ART. 66. Le contrat finit-il au
  départ du travailleur ou à l'expiration du préavis ? Le texte se tait. En
  dépendent · le logement de l'art. 138 (obligation du contrat, due ou non
  pendant le temps restant) ; le MOIS DE CESSATION que le décompte remplace
  (`motifRefusMoisDeCessation` lit la date de fin du registre) ; les « mois
  entiers de service » du congé (art. 141, al. 2, services pris en
  considération) et l'indemnité compensatoire de l'art. 144. OmegaX prend la
  date de fin déclarée au registre, sans la déduire.

## Bloc du § 3 (2026-10-03, premier passage, avant le premier tour)

- Serveur · `tsc` vert, `nest build` vert, `jest --maxWorkers=2` · 704 suites,
  9 731 tests ; 6 suites tombées au premier passage pour une cause
  d'ENVIRONNEMENT (la copie n'avait pas de `node_modules` et lisait celui du
  dépôt parent, client Prisma engendré d'un autre schéma, `ts-node` absent),
  relancées seules après `npm ci` et `prisma generate` dans la copie · vertes.
- Client · `tsc` vert, `vitest` 205 fichiers, 1 672 tests verts, `build` vert.

## Reste

- Intégration sur `main` (relecture, tests navigateur), puis retrait de cette
  fiche et de la branche `travail/a9`.

## Commandes de vérification

```bash
npx jest src/modules/personnel --maxWorkers=2
npx tsc --noEmit
(cd client && npx tsc --noEmit && npx vitest run src/pages/decompte-articles-66-67.spec.ts)
```
