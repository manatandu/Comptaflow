/**
 * ARRONDI LÉGAL DE L'IMPÔT · art. 150 de la loi n° 23/053, TITRE VI,
 * chapitre 1 « DES DISPOSITIONS RELATIVES AUX ARRONDIS » :
 *
 *   « Lorsque le montant de l'Impôt sur les Sociétés, de l'Impôt minimum, de
 *   l'Impôt sur le Revenu des Personnes Physiques et de tous autres
 *   prélèvements prévus dans la présente Loi comprend une décimale, cette
 *   fraction est arrondie à l'unité supérieure si la première décimale est
 *   supérieure ou égale à 5. Dans le cas contraire, elle est ramenée à
 *   l'unité inférieure.
 *   Lorsque le montant arrondi comprend une tranche supérieure ou égale à 50
 *   Francs congolais, celle-ci est ramenée à la centaine de Francs congolais
 *   supérieure.
 *   Lorsque cette tranche est inférieure à 50 Francs congolais, elle est
 *   ramenée à la centaine de Francs congolais inférieure. »
 *
 * CE N'EST PAS `arrondir`, ET C'EST TOUT L'ÉCART. `arrondir` est l'arrondi
 * COMPTABLE au centime, celui d'un solde ou d'un retraitement ; l'art. 150
 * est l'arrondi FISCAL, en deux temps, et il finit à la centaine de francs.
 * Le module liquidait au centime : sur un chiffre d'affaires de
 * 123 456 789 FC, l'impôt minimum de 1 % vaut 1 234 567,89 FC au centime et
 * 1 234 600 FC selon la loi. L'écart est borné à moins de cent francs, mais
 * le montant affiché n'était pas celui qui se déclare, et il servait ensuite
 * d'assiette aux acomptes de l'exercice suivant.
 *
 * UN SEUL PORTEUR, DEUX APPELANTS (audit final F111) · le module fiscal et
 * la paie. La paie refusait d'arrondir l'impôt (« un second arrondi que le
 * texte n'écrit pas ») pendant que ce module l'appliquait · deux lectures de
 * la même loi, deux retenues. Le texte tranche · il nomme l'IRPP, et
 * l'art. 119 appelle IRPP ce que l'employeur retient chaque mois.
 *
 * PORTÉE VOLONTAIREMENT ÉTROITE · l'article vise « l'Impôt sur les Sociétés,
 * l'Impôt minimum, l'Impôt sur le Revenu des Personnes Physiques et tous
 * autres prélèvements prévus dans la présente Loi ». Les acomptes
 * provisionnels et les quotités ne sont pas prévus par cette loi-ci mais par
 * la loi de procédures fiscales (art. 57 bis et 57 quater) : ils restent au
 * centime, et leur base est l'impôt DÉJÀ arrondi.
 */
export function arrondirImpotArt150(montant: number): number {
  if (!Number.isFinite(montant)) return montant;
  const entier = Math.floor(montant);
  // La « première décimale », littéralement · l'epsilon protège du cas où la
  // représentation binaire rend 0,5 sous la forme 0,4999999999999999.
  const premiereDecimale = Math.floor((montant - entier) * 10 + 1e-9);
  const unite = premiereDecimale >= 5 ? entier + 1 : entier;
  // « La tranche » est ce qui reste sous la centaine · le modulo est ramené
  // dans [0, 100[ pour qu'un montant négatif ne remonte pas la centaine du
  // mauvais côté. Un impôt n'est jamais négatif ici, mais la fonction est
  // exportée et sera appelée ailleurs.
  const tranche = ((unite % 100) + 100) % 100;
  return tranche >= 50 ? unite - tranche + 100 : unite - tranche;
}
