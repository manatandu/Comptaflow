# AVANCEMENT · ligne A6 bis (défauts de production de l'écart de change réalisé)

Branche de sauvegarde · `travail/a6bis`, partie de `origin/main` 5d388c0.
Fiche retirée à l'intégration (CLAUDE.md § 5, « RIEN NE SE PERD »).

## Textes lus (à l'instant, dans les compétences)

- AUDCIF art. 50 à 58-4 (`titre-1-ch4-evaluation-resultat.md`).
- AUDCIF Titre VIII ch. 22 · § 1.1 (immobilisations, « paiement à terme
  libellé en devises » · « charge ou produit financier »), section 2 et
  § 2.3 (règlement, 656 / 756 commercial, 676 / 776 financier, « la provision
  pour pertes de change de fin d'exercice est ajustée pour tenir compte des
  opérations dénouées »), section 4 (disponibilités en devises).
- Titre VII, fiches des comptes 40, 41 (dont 404 « Fournisseurs,
  acquisitions courantes d'immobilisations » et 414 « Créances sur cessions
  courantes d'immobilisations »), 52 (« les avoirs en monnaies étrangères
  sont évalués au dernier cours officiel de change connu »).
- SYCEBNL Partie 2 ch. 2 (plan · ni 404 ni 414) et ch. 3, fiches 40, 41, 52.

## Fait

- B1 · `coursEtFrancsDuReglement` refuse montant en devise, francs et cours
  (saisi ou déduit) nuls, négatifs, `null` ou NaN, sur la valeur arrondie que
  la pièce porterait ; DTO `montant` en `@FacultatifNonNul` + `@IsPositive` ;
  service · `undefined` seul vaut « le dû entier ». Tests · règle pure, porte
  (class-validator), service (six cas, aucune pièce).
- B3 · le RIB du journal se lit à CHAQUE règlement ; case « Moyen de paiement
  en devise » décochée et RIB tenu dans une devise étrangère · refus, que le
  lot soit en devise ou en francs (art. 57 ; fiche du compte 52 des deux
  plans). La trésorerie en devise sur facture en francs n'est PAS ouverte
  (relevé), le refus nomme l'issue (journal d'un compte en francs, ou saisie
  au journal avec devise et cours).

## Reste

- B2 · groupe de lettrage à cheval sur deux exercices.
- M1 à M7.

## Décisions prises

(avec leur article, à chaque commit)

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/reglements src/modules/lettrage src/modules/exercice --maxWorkers=2
(cd client && npx tsc --noEmit && npx vitest run src/lib/ecart-change.spec.ts)
```
