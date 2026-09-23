/**
 * LES EN-TÊTES D'UNE REQUÊTE · et pourquoi une LECTURE n'en porte aucun.
 *
 * Le site (oomega.web.app) et l'API (Cloud Run, us-east1) sont deux origines.
 * Toute requête qui porte un `Content-Type: application/json` ou un en-tête
 * maison comme `X-CSRF-Token` n'est plus « simple » au sens de CORS : le
 * navigateur la fait PRÉCÉDER d'une requête OPTIONS et attend la réponse
 * avant d'envoyer la vraie. Depuis Kinshasa, c'est un aller-retour
 * transatlantique de plus, sur CHAQUE appel · et une fenêtre en fait
 * plusieurs à son ouverture.
 *
 * Or sur un GET, les deux en-têtes ne servaient à rien : il n'y a pas de corps
 * à typer, et le serveur ne contrôle le jeton CSRF que sur les méthodes qui
 * modifient (`METHODES_MUTANTES`, jwt.strategy.ts). Un GET sans eux est une
 * requête simple, envoyée directement avec son cookie. Les écritures gardent
 * les deux, et leur contrôle préalable est mis en cache deux heures par le
 * serveur (`maxAge` de la configuration CORS).
 */
export function entetesRequete(
  methode: string | undefined,
  csrf: string | null,
  supplementaires?: HeadersInit,
): HeadersInit {
  const m = (methode ?? 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return { ...(supplementaires as Record<string, string> | undefined) };
  return {
    'Content-Type': 'application/json',
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    ...(supplementaires as Record<string, string> | undefined),
  };
}
