/**
 * Le montant saisi dans un champ, ou `null` (ligne A5, relecture adverse m4) ·
 * un champ vide n'est pas zéro. `Number('')` rend 0, et une déclaration
 * partait à zéro sans que personne l'ait tapé. Zéro se tape ; vide, blanc ou
 * illisible rend `null`, et l'écran refuse l'envoi.
 */
export function montantSaisi(texte: string): number | null {
  const t = texte.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
