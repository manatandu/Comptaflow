/**
 * Validation du démarrage · pas une simple lecture avec repli silencieux.
 *
 * Trouvé lors de l'audit de la brique Export Excel (2026-08-28) :
 * `jwt.strategy.ts` repliait `JWT_SECRET` sur la valeur littérale
 * `'change-me'` si la variable d'environnement était absente. Le côté
 * signature (`auth.module.ts`) ne le fait PAS · sans `JWT_SECRET`, signer un
 * jeton échoue déjà. Mais le côté VÉRIFICATION acceptait silencieusement
 * n'importe quel jeton signé avec cette chaîne bien connue, publiée dans ce
 * dépôt (`.env.example`). En production, sans cette variable positionnée,
 * n'importe qui aurait pu forger un jeton valide pour N'IMPORTE QUEL
 * tenant · ce qui aurait annulé toutes les garanties d'étanchéité
 * multi-tenant (chaque requête filtre bien par `tenantId`, encore faut-il
 * que ce `tenantId` vienne d'un jeton authentique).
 *
 * Corrigé en refusant de démarrer plutôt qu'en repliant sur une valeur
 * connue : une vérification insuffisante doit échouer bruyamment au
 * déploiement, jamais silencieusement en production.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const secret = config.JWT_SECRET;

  if (typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error(
      "JWT_SECRET est obligatoire et doit être défini dans l'environnement (.env en local, " +
        'variable de déploiement en production) · aucun repli silencieux, voir validate-env.ts.',
    );
  }

  // Alerte plutôt que blocage : la valeur du dépôt public (.env.example) ou
  // une valeur trop courte pour résister à une attaque par force brute
  // n'empêchent pas de démarrer en local/CI, mais ne doivent jamais
  // atteindre un déploiement réel.
  const VALEURS_CONNUES = ['change-me', 'dev-secret-change-me'];
  if (VALEURS_CONNUES.includes(secret) || secret.length < 32) {
    // eslint-disable-next-line no-console
    console.warn(
      '⚠ JWT_SECRET utilise une valeur de développement ou trop courte (< 32 caractères). ' +
        'À ne JAMAIS utiliser en production · générez une valeur aléatoire dédiée par environnement.',
    );
  }

  return config;
}
