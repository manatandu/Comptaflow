# Documents historiques

Ce dossier range les documents qui ne sont plus que de l'histoire (audit final
F267, 2026-09-28). Ils décrivent OmegaX à une date passée, et aucun ne dit
l'état du logiciel · celui-ci se lit dans `CLAUDE.md` et dans le code. Chacun
porte en tête un bandeau daté qui dit ce qui y est révolu et où lire l'état à
jour.

| Document | Écrit le | L'état à jour se lit dans |
|---|---|---|
| `ecarts-sage-omegax.md` | 2026-08-29 | `docs/comparaison-sage-i7-omegax.md`, `CLAUDE.md` |
| `audit-complet-2026-08.md` | 2026-08-29 | `CLAUDE.md`, `docs/plan-ordonne-2026-09.md` |

**Ce qui n'y est pas rangé, et pourquoi.** Un document que le code, un spec,
`CLAUDE.md` ou une compétence citent reste à son adresse, sous un bandeau
daté · le déplacer casserait la référence, et une compétence ne se modifie pas
depuis une session (`CLAUDE.md` § 11). Restent donc en place, bandeau posé le
même jour :

- `plan-de-construction.md` · cité par le schéma, les services, les écrans et
  la compétence `sage-i7` ;
- `releve-de-manques-referentiels.md` · cité par le schéma et par
  `regularisation.service.ts` ;
- `decision-multi-classification.md` · cité par `CLAUDE.md` et par le module
  IFRS, décision toujours en vigueur ;
- `plan-ordonne-2026-09.md` · cité par `CLAUDE.md`, et encore tenu ;
- `etats-financiers-liasses-referentiels.md` · aucun fichier du code ne le
  cite, mais ce n'est pas un relevé daté · c'est le cahier des charges
  d'origine du module des états financiers, et une partie en reste vraie (la
  charte ETAFI qu'il décrit est celle des classeurs produits,
  `src/modules/exports/etat-etafi.ts`). Son bandeau dit ce qui y est révolu.

**Un document qui entre ici y entre avec son bandeau.**
`src/common/documents-historiques.spec.ts` exige de chaque fichier du dossier
un bandeau « HISTORIQUE · bandeau posé le AAAA-MM-JJ » en tête, une ligne dans
la table ci-dessus, et qu'aucun double ne reste à son ancienne adresse dans
`docs/`, où il continuerait de se lire comme vivant.
