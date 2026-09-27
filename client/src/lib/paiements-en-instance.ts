/**
 * LE REPÈRE H SUIT L'ÉTAT JUSQU'AU FICHIER (audit final F13). L'écran, l'export
 * du tableau et la liasse complète envoient la même saisie ; un champ vide
 * n'envoie rien, et le serveur dit alors « non renseigné » au lieu de zéro.
 */
export function parametrePaiementsEnInstance(saisie: string): string {
  const v = saisie.trim();
  return v === '' ? '' : `&paiementsEnInstance=${encodeURIComponent(v)}`;
}
