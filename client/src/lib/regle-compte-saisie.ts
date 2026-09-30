/**
 * CE QUE L'AVERTISSEMENT D'IMPUTATION PROPOSE À LA PLACE DU COMPTE SAISI.
 *
 * La fiche d'un compte est servie à tous ses sous-comptes · la fiche 10 du
 * SYCEBNL vise « Les comptes 101 et 102 » et renvoie au 104, si bien qu'une
 * saisie au 10410000 lisait « comptes à utiliser à la place : 104, 16, 46 »,
 * c'est-à-dire lui-même (passe R5-B4). Un remplacement dont le compte saisi
 * relève n'en est pas un · il est retiré de la liste résumée. Le texte cité,
 * lui, reste entier.
 */
export interface RenvoiDiscordant {
  numero: string;
  intituleCite: string;
  intitulePlan: string;
}

export function remplacementsProposes(comptesAUtiliser: readonly string[], numeroSaisi: string): string[] {
  return comptesAUtiliser.filter((n) => !numeroSaisi.startsWith(n));
}

/**
 * Un renvoi du texte que le plan du même référentiel intitule autrement
 * (passes R5-A1, R5-C1) · une ligne courte, jamais un autre numéro choisi.
 */
export function libelleRenvoiDiscordant(d: RenvoiDiscordant): string {
  return `le texte renvoie au ${d.numero} « ${d.intituleCite} », que le plan intitule « ${d.intitulePlan} »`;
}
