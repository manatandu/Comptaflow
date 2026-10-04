# AVANCEMENT · ligne A22

Branche locale `travail-a22`, sauvegarde `travail/a22`, partie de `main` 2dd40a9.
Trois relevés anciens des immobilisations (`docs/suivi-immobilisations-verrouille.md`).

## Relevé 1 · dépréciation d'un bien en cours (2919 à 2949) et mise en service · FAIT

Textes lus · AUDCIF Titre VII, fiche du compte 29 (subdivisions 2919, 2929,
2939, 2949 ; « aussi bien sur les immobilisations acquises que sur celles en
cours de fabrication » ; crédit par 691, 697, 853, débit par 791, 797, 863) ;
SYCEBNL Partie 2 ch. 2 (mêmes subdivisions) et fiche du compte 29 (crédit par
69 ou 853, débit par 79 ou 863) ; fiches 21 à 24 des deux textes (virement du
BRUT seul à l'achèvement). Aucun texte ne vire le 29x9.

Décisions (`src/modules/immobilisations/depreciation-en-cours.ts`) ·
(1) aucun virement inventé ; (2) la mise en service n'est PAS refusée · le
refus « reprise puis nouvelle dotation » enfermerait le bien (une dépréciation
par bien et par exercice, `@@unique([immobilisationId, exerciceId])`, et
reprise comme dotation à la clôture seulement) ; la réponse de la mise en
service DIT la dépréciation laissée au 29x9 (`avertissementDepreciation`),
l'écran l'affiche ; (3) un bien, un compte 29 tant qu'une dépréciation est en
place (sinon une reprise sur un autre 29 le rend débiteur et la sortie, qui
solde le compte de la dernière dépréciation, laisse l'autre) · deux
référentiels ; (4) SYSCOHADA seul, la PREMIÈRE dotation suit le compte inscrit
à la clôture (29x9 pour un bien en cours, jamais 29x9 pour un bien achevé),
Titre VII ch. 2 « développés selon la structure des comptes de la classe 2 ».
L'écran présélectionne le 29 en place (`client/src/lib/depreciation-en-cours.ts`).

À REMONTER À MANASSE (corpus muet) · après la mise en service, la dépréciation
reste au 29x9 et le bilan la range sous le poste de ce compte (au SYSCOHADA,
2939p en AL, `correspondance-bilan-syscohada.ts`), pas forcément celui du
bien achevé. La placer sous le bon poste exige soit un virement 29x9 vers 29x
(aucun texte), soit reprise et dotation à la même clôture (le module n'en
admet qu'une par exercice).

## Relevé 2 · prix global avec fonds de commerce · À FAIRE

## Relevé 3 · 787 du Guide contre 72 de l'AUDCIF · À FAIRE

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/immobilisations --maxWorkers=2
(cd client && npx tsc --noEmit && npx vitest run src/lib/depreciation-en-cours.spec.ts)
```
