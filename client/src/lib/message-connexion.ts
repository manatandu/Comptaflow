/**
 * LE MESSAGE D'UNE CONNEXION QUI ÉCHOUE · il dit la cause. « Une erreur est
 * survenue » a caché, jusqu'au 2026-09-26, le seul message utile du cas le
 * plus fréquent : la connexion acceptée par le serveur, puis la session jetée
 * par un navigateur qui bloque les cookies tiers (tous ceux de l'iPhone).
 * Ce message vient de `chargerUtilisateur` (lib/auth.tsx) sous forme d'Error
 * ordinaire, que l'écran ne lisait pas parce que ce n'était pas une ApiError.
 */
export function messageConnexion(err: unknown): string {
  // fetch lève un TypeError quand la requête n'aboutit pas du tout.
  if (err instanceof TypeError) return 'Le serveur ne répond pas · vérifiez la connexion internet, puis réessayez.';
  if (err instanceof Error && err.message) return err.message;
  return 'Une erreur est survenue';
}
