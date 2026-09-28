/**
 * LES MONTANTS S'ÉCRIVENT D'UNE SEULE MAIN (audit final F256).
 *
 * Une trentaine d'écrans portaient chacun leur copie du formatage, et les
 * copies avaient divergé · les unes à deux décimales fixes, d'autres à « au
 * moins deux » (un montant calculé sortait alors à trois décimales, 1 234,567),
 * d'autres sans option (1 234,5 à côté de 1 234,50 dans la même fenêtre), et un
 * montant absent y valait tour à tour « 0,00 », rien ou « · ». Un zéro écrit à
 * la place d'une absence se lit « rien n'est dû » quand personne n'a répondu
 * (CLAUDE.md § 9 ter).
 *
 * TROIS RÈGLES, et c'est tout ce que ce fichier fait.
 *  · Deux décimales, ni plus ni moins · la monnaie de tenue se compte au
 *    centime, et c'est au centime que les états bouclent.
 *  · Le montant est arrondi au centime AVANT d'être écrit, et un zéro négatif
 *    est ramené à zéro · -0,001 s'écrirait sinon « -0,00 », un solde nul qui a
 *    l'air débiteur. Le demi-centime s'éloigne de zéro DES DEUX CÔTÉS, comme
 *    l'arrondi d'Intl que les copies utilisaient · `Math.round` seul arrondit
 *    vers le haut, et -1 234,125 sortait « -1 234,12 » quand 1 234,125 sortait
 *    « 1 234,13 », un débit et un crédit du même montant écrits différemment.
 *  · Une valeur absente ou illisible n'est jamais un nombre · elle rend le
 *    texte d'absence de l'appelant, « · » par défaut.
 *
 * Les quantités, les taux et les nombres de lignes ne sont pas des montants et
 * ne passent pas ici.
 */

const FORMAT = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** La valeur lue en nombre · un Decimal sérialisé arrive en chaîne. */
function lire(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Au centime, le demi-centime loin de zéro, un zéro négatif ramené à zéro. */
function auCentime(n: number): number {
  const c = (Math.sign(n) * Math.round(Math.abs(n) * 100)) / 100;
  return c === 0 ? 0 : c;
}

/** Un montant à deux décimales ; `absent` quand la valeur manque ou ne se lit pas. */
export function montant(v: unknown, absent = '·'): string {
  const n = lire(v);
  return n === null ? absent : FORMAT.format(auCentime(n));
}

/**
 * Le montant, ou rien quand il est nul ou absent · la colonne Débit d'une
 * ligne au crédit, la case d'un tableau que le poste ne touche pas.
 */
export function montantOuVide(v: unknown): string {
  const n = lire(v);
  const c = n === null ? 0 : auCentime(n);
  return c === 0 ? '' : FORMAT.format(c);
}
