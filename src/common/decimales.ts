/**
 * LES DÉCIMALES D'UN MONTANT SE COMPTENT SUR SON ÉCRITURE, pas par un produit
 * flottant (audit final F108) · `19.99 * 100` vaut 1998.9999999999998, et
 * `Math.round(x * 100) !== x * 100` refusait 19,99, 1,1 ou 1234,1 comme s'ils
 * portaient trois décimales. L'écriture la plus courte d'un double est celle
 * qui a été saisie, et c'est aussi ce que compte `maxDecimalPlaces` de
 * class-validator · la porte et la règle comptent donc de la même façon.
 */
export function nombreDeDecimales(x: number): number {
  const t = String(x);
  // Notation exponentielle · un entier très grand n'a pas de décimale, un
  // nombre très petit en a plus que tout plafond qu'on lui opposera.
  if (/e/i.test(t)) return Number.isInteger(x) ? 0 : Number.POSITIVE_INFINITY;
  const i = t.indexOf('.');
  return i < 0 ? 0 : t.length - i - 1;
}
