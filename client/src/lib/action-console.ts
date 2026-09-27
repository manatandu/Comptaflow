/**
 * L'action demandée à la console par son adresse (`?action=…`).
 *
 * Deux commandes du menu Fichier ouvraient la même console,
 * « Nouveau fichier comptable… » et « Administration VMG Consulting », et
 * la première laissait l'opérateur chercher le bouton de création. Elle
 * l'ouvre désormais directement. Hors de la page, pour être vérifiable sans
 * monter la console (qui lit le stockage du navigateur).
 */
export type ActionConsole = 'nouveau-cabinet';

export function actionDeConsole(adresse: string | undefined): ActionConsole | null {
  const brut = new URLSearchParams(adresse?.split('?')[1] ?? '').get('action');
  return brut === 'nouveau-cabinet' ? brut : null;
}
