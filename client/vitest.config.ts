/**
 * Configuration du lanceur de tests du client, séparée de vite.config.ts à
 * dessein : `vitest` n'est pas une dépendance installée du projet (il se
 * lance par `npm test`), donc ses types ne sont pas résolvables, et la clé
 * `test` posée dans vite.config.ts cassait `tsc -b` du build. Ce fichier
 * n'est inclus dans aucun tsconfig et n'importe rien · vitest accepte un
 * objet simple.
 *
 * SA VERSION EST FIGÉE DANS LE SCRIPT `test` de package.json (audit final
 * F196), et c'est le seul endroit où elle s'écrit · un `npx vitest run` nu
 * prenait en CI la dernière version publiée, si bien qu'une publication de
 * vitest pouvait faire tomber le portillon sans qu'une ligne du dépôt ait
 * bougé. Elle n'est pas une devDependency parce que vitest 5 exige vite 6.4
 * au moins, et que le client est sur vite 5 · l'installer forcerait une
 * montée de vite, qui est un autre chantier.
 *
 * `globals` injecte describe/it/expect, sans quoi calcul.spec.ts échoue avant
 * même de tester quoi que ce soit (« describe is not defined »).
 */
export default { test: { globals: true } };
