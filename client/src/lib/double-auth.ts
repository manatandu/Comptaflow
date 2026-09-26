/** La clé par groupes de quatre · elle se recopie à la main dans l'application d'authentification. */
export function cleLisible(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}
