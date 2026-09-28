/**
 * LE BANDEAU DE LA VITRINE · un dossier de démonstration montre des chiffres
 * qui ont l'air vrais, et c'est le but. Ce qui ne doit jamais arriver est
 * qu'une capture d'écran, un état ouvert en réunion ou un poste laissé allumé
 * fasse lire ces chiffres comme ceux d'une entité réelle. D'où un bandeau
 * PERMANENT, sur chaque écran, que rien ne ferme.
 *
 * LE DRAPEAU DU DOSSIER, JAMAIS SON NOM · `Tenant.estDemonstration`, servi
 * par /auth/me. Reconnaître la vitrine à son intitulé marcherait jusqu'au jour
 * où un client s'appellerait « Démo » · même règle que la console
 * (`PlateformeService.preparerDossierDemonstration`, point 3).
 *
 * La règle vit hors du composant, pour se vérifier sans monter React · même
 * parti que `resoudreExercice` et `echeances-a-venir.ts`.
 */

export const LIBELLE_BANDEAU_DEMONSTRATION = 'Dossier de démonstration · données fictives';

/** Le texte du bandeau, ou `null` hors vitrine. Un faux strict · une valeur absente n'est pas une vitrine. */
export function bandeauDemonstration(tenant: { estDemonstration?: boolean | null } | null | undefined): string | null {
  return tenant?.estDemonstration === true ? LIBELLE_BANDEAU_DEMONSTRATION : null;
}
