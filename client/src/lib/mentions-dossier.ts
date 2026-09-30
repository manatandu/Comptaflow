import type { FormeJuridiqueSyscohada, Referentiel } from './types';

/**
 * CE QUE L'ÉCRAN DES PARAMÈTRES PROPOSE SELON LA FORME · miroir des règles du
 * serveur (`src/modules/tenant/mentions-societe.ts`), qui seul refuse.
 * Masquer n'est pas refuser (CLAUDE.md § 6) · l'écran évite seulement de
 * proposer un geste que la route rejettera.
 */

/**
 * AUSCGIE art. 269-1 · la clause de variabilité n'est ouverte qu'aux
 * « sociétés anonymes ne faisant pas appel public à l'épargne et sociétés
 * par actions simplifiées ». Miroir de `FORMES_CAPITAL_VARIABLE`.
 */
export const FORMES_CAPITAL_VARIABLE: readonly FormeJuridiqueSyscohada[] = [
  'SOCIETE_ANONYME',
  'SOCIETE_PAR_ACTIONS_SIMPLIFIEE',
];

/** Les cinq sociétés commerciales de l'AUSCGIE art. 6, que vise l'art. 17. */
const SOCIETES_COMMERCIALES: readonly FormeJuridiqueSyscohada[] = [
  'SOCIETE_ANONYME',
  'SOCIETE_PAR_ACTIONS_SIMPLIFIEE',
  'SOCIETE_RESPONSABILITE_LIMITEE',
  'SOCIETE_NOM_COLLECTIF',
  'SOCIETE_COMMANDITE_SIMPLE',
];

export const estCooperative = (forme: FormeJuridiqueSyscohada | null | undefined) => forme === 'SOCIETE_COOPERATIVE';

/** La case « À capital variable » n'est proposée qu'à la SA et à la SAS. */
export const proposeCapitalVariable = (forme: FormeJuridiqueSyscohada | null | undefined) =>
  !!forme && FORMES_CAPITAL_VARIABLE.includes(forme);

/**
 * Le champ « Adresse » est celle du SIÈGE SOCIAL pour qui l'imprime à ce titre
 * · AUSCGIE art. 17 et 23 à 25 pour une société commerciale, AUSCOOP art. 19
 * pour la coopérative. Une ville seule n'en est pas une (art. 25).
 */
export function libelleAdresse(referentiel: Referentiel | undefined, forme: FormeJuridiqueSyscohada | null | undefined): string {
  if (referentiel !== 'SYSCOHADA' || !forme) return 'Adresse';
  return SOCIETES_COMMERCIALES.includes(forme) || estCooperative(forme) ? 'Adresse du siège social' : 'Adresse';
}
