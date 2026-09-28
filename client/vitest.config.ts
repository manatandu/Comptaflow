/**
 * Configuration du lanceur de tests du client, séparée de vite.config.ts à
 * dessein : la clé `test` posée dans vite.config.ts cassait `tsc -b` du build,
 * qui compile ce fichier-là (tsconfig.node.json) avec les seuls types de vite.
 * Ce fichier n'est inclus dans aucun tsconfig et n'importe rien · vitest
 * accepte un objet simple.
 *
 * VITE ET VITEST SONT DES devDependencies À VERSION EXACTE, portées par le
 * lockfile (audit final F196, décision du 2026-09-28), et `npm test` lance
 * `vitest run`, c'est-à-dire le vitest que `npm ci` a installé. Deux états
 * l'ont précédé, chacun faux à sa manière · un `npx vitest run` nu prenait en
 * CI la dernière version publiée, et `npx --yes vitest@5.0.2 run` figeait
 * vitest mais laissait npx installer vite, sa peerDependency, HORS du
 * lockfile · les tests tournaient sous vite 8 quand la construction tournait
 * sous vite 5. Vitest 5 exige vite 6.4 au moins, d'où la montée de vite.
 * `chaine-de-livraison.spec.ts` (côté serveur) gèle les deux versions, le
 * script et le lockfile.
 *
 * `globals` injecte describe/it/expect, sans quoi calcul.spec.ts échoue avant
 * même de tester quoi que ce soit (« describe is not defined »).
 */
export default { test: { globals: true } };
