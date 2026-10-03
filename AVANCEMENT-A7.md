# Avancement de la ligne A7 · créances douteuses ou litigieuses

Branche de sauvegarde · `travail/a7` (jamais `main`). Pousser après chaque commit ·
`git push -q origin HEAD:refs/heads/travail/a7`.

## Fait

- Lignes A7 livrées jusqu'à la sixième relecture (6b25582, fusion de `main`).
- Relectures « échecs silencieux » et « écran » sur 6b25582 :
  - M1 · les trois annulations relisent le statut de l'écriture dans leur
    transaction ; suppression filtrée sur le brouillard, une ligne sinon 409
    (AUDCIF art. 20, al. 2 ; art. 22, 2°).
  - M2 · `depreciationsOrphelines` relu dans la transaction de clôture
    (`exercice.service.ts`) ; D3 d'A6 laissé avant, dit en commentaire et au suivi.
  - M3 · `compenser` consigne l'échec du retrait avec l'identifiant, l'erreur
    d'origine remonte.
  - M4 · `comptes()` rend `plafond`, `filtreNumero`, accepte `numero` (chiffres) ;
    l'écran affiche la liste tronquée et l'issue (restreindre par début de numéro).
  - M5 · annulations listées des plus récentes, `annulations.{revues,mouvements}`
    avec `total` et `tronque`, affichées.
  - M6 · rapprochement non calculé sur liste tronquée dit à l'écran.
  - M7 · `soldeAuPlusTard` sur tous les exercices finissant au plus tôt avec
    celui du reclassement (take 20).
  - M8 · message `motifResteNegatif` corrigé ; porte « régulariser » NON faite
    (pas simple, aucune fiche ne dit l'écriture), écrite au suivi.
  - Écran 1 à 14 · dialogues, Échap, focus, libellés reliés, motifs au clavier,
    liste vidée au changement d'exercice, jetons de requête, envoi unique,
    journaux illisibles dits, Aide, droits alignés, Retirer sous `ouvert`,
    `montantPourChamp`, annonce de revue sur `propositionRevue.comptes`,
    date bornée, `scope="col"`.
  - CLAUDE.md (paragraphe A7) et `docs/suivi-immobilisations-verrouille.md` à jour.

- `reevaluation-f54-f55.spec.ts` · la doublure de transaction de la clôture
  porte `creanceDouteuse` (M2 relit les orphelines dans la transaction).
- Bloc du § 3 vert · serveur 699 suites, 9674 tests ; client 203 fichiers,
  1656 tests ; constructions des deux côtés ; e2e typé.

## Reste à faire

- Un dernier tour de relecture ; seul un BLOQUANT (montant faussé en silence,
  geste juste refusé sans issue, dossier enfermé) fait reprendre.
- Ouverts au suivi, hors de cette passe · porte de régularisation d'un reste
  négatif dans un exercice clos (M8) ; D3 d'A6 lu avant la transaction.

## Décisions et leurs articles

- Base de dépréciation au TTC inscrit au 416 (fiches des comptes 41 et 49,
  décision de Manasse du 2026-10-03).
- Perte au TTC entier, D 651 / C 416, aucune ligne de TVA (A7 scindée, A7 bis).
- Annulation par inscription en négatif d'une écriture validée (AUDCIF art. 20, al. 2).

## Vérification

```bash
npx prisma generate && npx tsc --noEmit -p . && npx jest && npm run build
cd client && npx tsc --noEmit && npm test && npm run build
cd ../e2e && npx tsc --noEmit -p .
```
