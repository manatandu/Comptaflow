/**
 * LES SIX CRITÈRES DES FRAIS DE DÉVELOPPEMENT, CÔTÉ ÉCRAN (lot 15) · AUDCIF
 * Titre VIII ch. 1 § 2.1.1, dans l'ordre du texte. Le serveur les juge
 * (`src/modules/immobilisations/frais-developpement.ts`) · ici, la seule mise
 * en forme de la saisie.
 */
export const CRITERES = [
  { cle: 'FAISABILITE_TECHNIQUE', libelle: 'Faisabilité technique' },
  { cle: 'INTENTION', libelle: "Intention d'achever et d'utiliser ou de vendre" },
  { cle: 'CAPACITE', libelle: "Capacité à l'utiliser ou à la vendre" },
  { cle: 'AVANTAGES_ECONOMIQUES', libelle: 'Avantages économiques futurs probables' },
  { cle: 'RESSOURCES', libelle: 'Ressources disponibles pour achever' },
  { cle: 'EVALUATION_FIABLE', libelle: 'Évaluation fiable des dépenses' },
] as const;

export type CleCritere = (typeof CRITERES)[number]['cle'];
export type SaisieCriteres = Record<CleCritere, string>;

export const criteresVides = (): SaisieCriteres =>
  Object.fromEntries(CRITERES.map((c) => [c.cle, ''])) as SaisieCriteres;

/** Le corps envoyé · seules les justifications écrites partent. */
export function corpsCriteres(saisie: SaisieCriteres, dateReunion: string): Record<string, unknown> {
  const criteres = Object.fromEntries(CRITERES.filter((c) => saisie[c.cle].trim()).map((c) => [c.cle, saisie[c.cle].trim()]));
  return {
    ...(Object.keys(criteres).length ? { criteresFraisDeveloppement: criteres } : {}),
    ...(dateReunion ? { dateReunionCriteresDeveloppement: dateReunion } : {}),
  };
}

