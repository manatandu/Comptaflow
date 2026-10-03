/**
 * JJ/MM/AAAA depuis une date ISO, par découpage de la chaîne · passer par
 * `new Date()` ferait reculer d'un jour une date d'exercice servie à minuit
 * UTC dès que le poste est à l'ouest de Greenwich, et un exercice affiché au
 * 31/12 au lieu du 01/01 accuserait une cellule à tort.
 *
 * Sorti de `controles-agregat-groupe.ts` pour servir aussi le Règlement des
 * tiers (ligne A7 quater, m8), qui affichait la date ISO brute du
 * reclassement d'une créance (« le 2026-06-15 »).
 */
export function jourFr(iso: string): string {
  const [annee, mois, jour] = iso.slice(0, 10).split('-');
  return jour && mois && annee ? `${jour}/${mois}/${annee}` : iso;
}
