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

## Relevé 2 · prix global avec fonds de commerce · FAIT

Textes lus · AUDCIF Titre VIII ch. 2 § 7.2.1 (« L'élément résiduel non affecté
à un compte spécifique est inscrit au débit du compte 2151 Fonds
commercial ») ; Titre VII, fiche du compte 21 (« 215 Fonds commercial », sans
subdivision) ; plan SYSCOHADA de la compétence (`215 Fonds commercial`, seul) ;
semis `21500000`. SYCEBNL · ni 215 ni 216 (refus serveur inchangé, option
masquée à l'écran hors SYSCOHADA).

Constat · serveur juste (fiche au 21500000 seulement s'il reste un reliquat),
écran faux · il mettait toujours le 21500000 dans l'intersection des
contreparties et saisissait sa durée même sans reliquat. Correction ·
`client/src/lib/prix-global.ts` lit le reliquat au centime (null tant qu'un
montant manque, jamais zéro), le fonds n'est visé que si le reliquat est
positif ou pas encore lisible, le reliquat est dit, la durée n'est demandée
et envoyée qu'avec un fonds qui naît ; le serveur refuse une durée du fonds
commercial sans reliquat ou hors fonds de commerce (déclaration sans fiche).

## Relevé 3 · 787 du Guide contre 72 de l'AUDCIF · FAIT

Textes lus · SYSCOHADA · AUDCIF Titre VII, fiches des comptes 67 (« transférés
au débit du compte d'immobilisation concerné par le crédit du compte 72 »), 72
et 78 (« Exclusions · Les transferts de charges en actif immobilisé → 72 ») ;
Guide, Partie 1 ch. 5, « Bien produit par l'entité » (72 ET 787 au crédit).
L'Acte uniforme prime sur le Guide · 72, comme le code. SYCEBNL · Acte art. 1
(le Système comptable est annexé à l'Acte) ; fiches 67 (« par le crédit du
compte 787 Transferts de charges financières ») et 72 (« via le compte
787 ») contre fiche 78 (exclusion « transferts de charges en actif immobilisé
→ 72 ») · contradiction interne, la règle particulière (intérêts
intercalaires) l'emporte · 787, comme le code ; anomalie écrite dans
`couts-emprunt-incorpores.ts`.

Incohérence trouvée et corrigée · le tableau des flux des associations
(SYCEBNL) lisait le 78 sans trésorerie et le débit du bien en acquisition
décaissée (poste FI), l'intérêt étant déjà décaissé au 671 · le tableau ne
bouclait plus. L'incorporation, reconnue par sa LIAISON
(`EcritureService.mouvementsDeCoutsEmpruntIncorpores`), est retranchée de FI
(`coutsEmpruntARetrancher`). Au SYSCOHADA le 72 est déjà dans l'EBE et le
ch. 5 range la production immobilisée en acquisitions · aller-retour exact,
rien à changer. Bulle `Aide` de l'écran · source par référentiel.

Relevés non codés · (a) les fiches du compte 72 des deux textes ne nomment au
débit que 21, 23, 24 et leurs fiches 22 ne citent pas le 72 · un 22 reste
admis (fiche 67, « compte d'immobilisation concerné ») ; (b) le tableau
emplois-ressources des projets ne neutralise pas les transferts en
immobilisations (limite déjà écrite dans `correspondance-projet-emplois-ressources.ts`),
une incorporation sur un projet y compterait l'intérêt deux fois.

## Rejeu sur vraie base, à travers une clôture (2026-10-04)

Base jetable `a22_1` (cluster local, port 55439), serveur compilé sur le port
8104, par l'API, deux dossiers, 2026 clôturé puis 2027.

SYSCOHADA · entrepôt de 10 000 000 inscrit au 2391 ; dotation 2026 au 2931
refusée (« encore inscrit en cours »), au 2939 passée · 2939 = -1 000 000,
2391 = 10 000 000. Fonds de commerce · prix 5 000 000 = mobilier 3 000 000 +
stock 2 000 000, durée du fonds refusée, sans elle aucun 215 (0) ; prix
6 500 000 · 215 = 1 500 000, 311 = 4 000 000. Clôture 2026 · 2939 à
l'ouverture 2027 = -1 000 000. Mise en service au 2027-03-01 · 231 =
10 000 000, 2391 = 0, 2939 = -1 000 000 (non viré), avertissement servi.
Reprise 2027 au 2931 refusée, au 2939 de 400 000 passée · 2939 = -600 000,
2931 = 0.

SYCEBNL · emprunt de 20 000 000, intérêts payés 1 200 000 ; bien de
15 000 000 au 2391 ; incorporation 20 000 000 × 6 % × 10/12 = 1 000 000 ·
787 = -1 000 000, 2391 = 16 000 000. TFT 2026 · FI = -15 000 000 (le seul
bien payé), contrôle cohérent, écart 0. Clôture 2026 · TFT 2027, FI N-1 =
-15 000 000, FI N = 0, cohérent.

## Vérification

Bloc du § 3 passé le 2026-10-04 · serveur `tsc`, `jest --maxWorkers=2`
(10 446 tests, un seul échec · `liasse-syscohada.spec.ts`, délai de 5 s
dépassé sous charge, 33 sur 33 relancé seul et 175 sur 175 pour
`src/modules/exports`), `npm run build` ; client `tsc`, `npm test` (1 776),
`npm run build`. Reste · relecture comptable et agents de relecture (§ 11),
tests navigateur à l'intégration.

```bash
npx tsc --noEmit
npx jest --maxWorkers=2
npm run build
(cd client && npx tsc --noEmit && npm test && npm run build)
```
