/**
 * Configuration du lanceur de tests du client, séparée de vite.config.ts à
 * dessein : `vitest` n'est pas une dépendance installée du projet (il se
 * lance par `npx vitest run`), donc ses types ne sont pas résolvables, et la
 * clé `test` posée dans vite.config.ts cassait `tsc -b` du build. Ce fichier
 * n'est inclus dans aucun tsconfig et n'importe rien · vitest accepte un
 * objet simple.
 *
 * `globals` injecte describe/it/expect, sans quoi calcul.spec.ts échoue avant
 * même de tester quoi que ce soit (« describe is not defined »).
 */
export default { test: { globals: true } };
