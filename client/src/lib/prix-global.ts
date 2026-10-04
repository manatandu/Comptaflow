/**
 * LE RELIQUAT DU FONDS DE COMMERCE, LU À L'ÉCRAN (ligne A22) · AUDCIF
 * Titre VIII ch. 2 § 7.2.1 · « L'élément résiduel non affecté à un compte
 * spécifique est inscrit au débit du compte 2151 Fonds commercial ». Le plan
 * SYSCOHADA n'ouvre que le 215, semé 21500000, et le serveur n'y crée la
 * fiche que s'il RESTE un reliquat (`ventilerFondsDeCommerce`,
 * `acquerirAPrixGlobal`).
 *
 * L'écran visait le 21500000 en toute hypothèse · la liste des comptes de
 * règlement était l'intersection des contreparties admises pour chaque bien
 * ET pour le fonds commercial, si bien qu'un prix entièrement ventilé (aucun
 * fonds créé) écartait des contreparties que le serveur aurait admises, et
 * la durée du fonds se saisissait pour une fiche qui ne naîtrait pas. Le
 * même calcul que le serveur, au centime, dit désormais s'il reste un
 * reliquat · la règle et ses refus restent au serveur, qui rejoue tout.
 *
 * Rend null tant qu'un montant n'est pas lisible · « pas encore saisi »
 * n'est pas zéro.
 */
const centimes = (x: number) => Math.round(x * 100) / 100;

export function reliquatFondsCommercial(prix: string, elements: readonly string[], stocks: readonly string[]): number | null {
  const lire = (v: string) => (v.trim() === '' ? NaN : Number(v));
  const p = lire(prix);
  const valeurs = [...elements, ...stocks].map(lire);
  if (!(p > 0) || valeurs.some((v) => !Number.isFinite(v))) return null;
  return centimes(p - centimes(valeurs.reduce((t, v) => t + v, 0)));
}
