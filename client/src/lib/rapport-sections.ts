import type { RapportActivite } from './types';

/**
 * LE RAPPORT ANNUEL, SECTION PAR SECTION, SOUS SA CLÉ (audit final F16).
 *
 * Deux régimes qui ne se transposent pas · le rapport d'activité du SYCEBNL
 * (art. 16-3) range ses quatre sections en colonnes, le rapport de gestion
 * SYSCOHADA (AUSCGIE art. 138, AUSCOOP art. 108) les siennes en JSON, sous
 * leur clé. L'écran associait les six sections AUSCGIE aux quatre colonnes
 * SYCEBNL par leur RANG, et n'envoyait jamais `sections` : une société ne
 * pouvait pas établir son rapport de gestion.
 */
const COLONNES_SYCEBNL = ['situationExerciceEcoule', 'perspectivesDeveloppement', 'evolutionTresorerie', 'evenementsPosterieurs'] as const;

/** Les textes d'une version établie, sous la clé de leur section. */
export function textesDuRapport(r: RapportActivite): Record<string, string> {
  if (r.sections) return { ...r.sections };
  return Object.fromEntries(COLONNES_SYCEBNL.map((c) => [c, r[c] ?? '']));
}

/** Le corps envoyé au serveur · `sections` en SYSCOHADA, les colonnes en SYCEBNL. */
export function corpsSectionsRapport(textes: Record<string, string>, rapportDeGestion: boolean) {
  if (rapportDeGestion) {
    return { sections: Object.fromEntries(Object.entries(textes).filter(([, v]) => v.trim() !== '')) };
  }
  return Object.fromEntries(COLONNES_SYCEBNL.map((c) => [c, textes[c]?.trim() ? textes[c] : undefined]));
}
