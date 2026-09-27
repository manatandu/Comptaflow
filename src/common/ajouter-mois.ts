/**
 * AJOUTER N MOIS, BORNÉ AU DERNIER JOUR DU MOIS (audit final F8).
 *
 * `setUTCMonth(+n)` déborde sur le mois suivant quand le jour n'existe pas ·
 * le 31 janvier plus un mois tombait au 3 mars. Un abonnement mensuel né le
 * 31 janvier n'avait donc pas d'échéance en février, et une charge manquait
 * sur l'année, sur des écritures parfaitement équilibrées. Le même calcul
 * était réécrit à quatre endroits ; il vit ici une fois.
 *
 * `finDeMoisSuit` · une date de fin de mois mène à une fin de mois (le 30
 * septembre plus trois mois donne le 31 décembre, pas le 30). C'est la
 * lecture « de date à date, fin de mois comprise » de la consolidation
 * (AUDCIF art. 97) ; ailleurs le jour est seulement borné.
 */
export function ajouterMois(date: Date, n: number, options: { finDeMoisSuit?: boolean } = {}): Date {
  const an = date.getUTCFullYear();
  const mois = date.getUTCMonth();
  const jour = date.getUTCDate();
  const dernierDu = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const cible = new Date(Date.UTC(an, mois + n, 1));
  const dernierCible = dernierDu(cible.getUTCFullYear(), cible.getUTCMonth());
  const finDeMois = options.finDeMoisSuit === true && jour === dernierDu(an, mois);
  return new Date(
    Date.UTC(
      cible.getUTCFullYear(),
      cible.getUTCMonth(),
      finDeMois ? dernierCible : Math.min(jour, dernierCible),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}
